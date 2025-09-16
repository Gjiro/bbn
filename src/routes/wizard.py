from flask import Blueprint, request, jsonify
from src.database import db
from src.models.balance_sheet import (
    Store, AccountType, Bank, Account, Snapshot,
    AccountBalance, WizardSession
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, desc, and_
from datetime import datetime, date
from decimal import Decimal
import json
import uuid

wizard_bp = Blueprint("wizard", __name__)

@wizard_bp.route("/initialize", methods=["POST"])
def initialize_wizard():
    """Initialize a new wizard session with all necessary data"""
    try:
        # Get all stores
        stores = Store.query.filter_by(is_active=True).order_by(Store.name).all()
        
        # Create a new wizard session
        session_id = str(uuid.uuid4())
        
        return jsonify({
            "success": True,
            "session_id": session_id,
            "stores": [{"id": s.id, "name": s.name, "code": s.code} for s in stores]
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/accounts/<int:store_id>", methods=["GET"])
def get_store_accounts(store_id):
    """Get all accounts for a specific store, organized by category"""
    try:
        # Verify store exists
        store = Store.query.get_or_404(store_id)
        
        # Get all accounts for this store
        accounts = Account.query.filter_by(
            store_id=store_id,
            is_active=True
        ).join(AccountType).order_by(AccountType.sort_order, Account.account_name).all()
        
        # Organize accounts by category
        organized_accounts = {
            "bank_accounts": [],
            "merchant_accounts": [],
            "inventory": [],
            "receivables": [],
            "liabilities": []
        }
        
        for account in accounts:
            account_data = {
                "id": account.id,
                "name": account.account_name,
                "account_number": account.account_number,
                "type": account.account_type.name,
                "category": account.account_type.category,
                "bank": account.bank.name if account.bank else None
            }
            
            # Categorize based on account type
            if account.account_type.name in ['Bank Checking', 'Bank Savings']:
                organized_accounts["bank_accounts"].append(account_data)
            elif account.account_type.name in ['Merchant Account', 'Intercompany Receivable', 'Points']:
                organized_accounts["merchant_accounts"].append(account_data)
            elif account.account_type.name == 'Inventory':
                organized_accounts["inventory"].append(account_data)
            elif account.account_type.name in ['Order Receivable', 'Tax Refund', 'Loan Receivable']:
                organized_accounts["receivables"].append(account_data)
            elif account.account_type.category == 'Liability':
                organized_accounts["liabilities"].append(account_data)
        
        return jsonify({
            "success": True,
            "store": {"id": store.id, "name": store.name, "code": store.code},
            "accounts": organized_accounts
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/drafts", methods=["GET"])
def get_drafts():
    """Get all draft snapshots"""
    try:
        # Get all drafts with store information and balance count
        drafts = db.session.query(
            Snapshot.id,
            Snapshot.snapshot_date,
            Snapshot.total_assets,
            Snapshot.total_liabilities,
            Snapshot.net_position,
            Snapshot.created_at,
            Snapshot.updated_at,
            Store.name.label('store_name'),
            Store.code.label('store_code'),
            func.count(AccountBalance.id).label('balance_count')
        ).join(
            Store, Snapshot.store_id == Store.id
        ).outerjoin(
            AccountBalance, Snapshot.id == AccountBalance.snapshot_id
        ).filter(
            Snapshot.status == 'draft'
        ).group_by(
            Snapshot.id,
            Snapshot.snapshot_date,
            Snapshot.total_assets,
            Snapshot.total_liabilities,
            Snapshot.net_position,
            Snapshot.created_at,
            Snapshot.updated_at,
            Store.name,
            Store.code
        ).order_by(
            desc(Snapshot.updated_at)
        ).all()
        
        drafts_list = []
        for draft in drafts:
            drafts_list.append({
                "id": draft.id,
                "snapshot_date": draft.snapshot_date.isoformat() if draft.snapshot_date else None,
                "store_name": draft.store_name,
                "store_code": draft.store_code,
                "total_assets": float(draft.total_assets) if draft.total_assets else 0,
                "total_liabilities": float(draft.total_liabilities) if draft.total_liabilities else 0,
                "net_position": float(draft.net_position) if draft.net_position else 0,
                "balance_count": draft.balance_count,
                "created_at": draft.created_at.isoformat() if draft.created_at else None,
                "updated_at": draft.updated_at.isoformat() if draft.updated_at else None
            })
        
        return jsonify({
            "success": True,
            "drafts": drafts_list
        })
        
    except Exception as e:
        print(f"Error getting drafts: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/save-snapshot", methods=["POST"])
def save_snapshot():
    """Save a complete balance sheet snapshot"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('store_id'):
            return jsonify({"success": False, "error": "Store ID is required"}), 400
        if not data.get('snapshot_date'):
            return jsonify({"success": False, "error": "Snapshot date is required"}), 400
        if not data.get('balances'):
            return jsonify({"success": False, "error": "Account balances are required"}), 400
        
        # Parse date
        snapshot_date = datetime.strptime(data['snapshot_date'], '%Y-%m-%d').date()
        
        # Delete draft if publishing from draft
        draft_id = data.get('draft_id')
        if draft_id:
            draft = Snapshot.query.get(draft_id)
            if draft and draft.status == 'draft':
                db.session.delete(draft)
        
        # Create snapshot
        snapshot = Snapshot(
            store_id=data['store_id'],
            snapshot_date=snapshot_date,
            created_by='wizard',
            notes=data.get('notes', ''),
            status='completed'
        )
        
        db.session.add(snapshot)
        db.session.flush()  # Get the snapshot ID
        
        # Add account balances
        total_assets = Decimal('0')
        total_liabilities = Decimal('0')
        
        for balance_data in data['balances']:
            account_id = balance_data.get('account_id')
            amount = Decimal(str(balance_data.get('amount', 0)))
            
            if not account_id:
                continue
            
            # Get account to determine if it's an asset or liability
            account = Account.query.get(account_id)
            if not account:
                continue
            
            # Create account balance
            balance = AccountBalance(
                snapshot_id=snapshot.id,
                account_id=account_id,
                balance=amount,
                notes=balance_data.get('notes', '')
            )
            db.session.add(balance)
            
            # Update totals
            if account.account_type.category == 'Asset':
                total_assets += abs(amount)
            elif account.account_type.category == 'Liability':
                total_liabilities += abs(amount)
        
        # Update snapshot totals
        snapshot.total_assets = total_assets
        snapshot.total_liabilities = total_liabilities
        snapshot.net_position = total_assets - total_liabilities
        
        # Calculate profit margin if we have sales data
        if data.get('ytd_sales'):
            snapshot.ytd_sales = Decimal(str(data['ytd_sales']))
        if data.get('ytd_profit'):
            snapshot.ytd_profit = Decimal(str(data['ytd_profit']))
            if snapshot.ytd_sales and snapshot.ytd_sales > 0:
                snapshot.profit_margin = (snapshot.ytd_profit / snapshot.ytd_sales * 100)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "snapshot_id": snapshot.id,
            "summary": {
                "total_assets": float(total_assets),
                "total_liabilities": float(total_liabilities),
                "net_position": float(snapshot.net_position)
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/latest-snapshot/<int:store_id>", methods=["GET"])
def get_latest_snapshot(store_id):
    """Get the latest snapshot for a store to use as a template"""
    try:
        # Get the latest snapshot
        latest_snapshot = Snapshot.query.filter_by(
            store_id=store_id,
            status='completed'  # Only load completed snapshots, not drafts
        ).order_by(Snapshot.snapshot_date.desc()).first()
        
        if not latest_snapshot:
            return jsonify({
                "success": True,
                "has_previous": False,
                "balances": {}
            })
        
        # Get all balances for this snapshot
        balances = AccountBalance.query.filter_by(snapshot_id=latest_snapshot.id).all()
        
        balance_dict = {}
        for balance in balances:
            balance_dict[balance.account_id] = float(balance.balance)
        
        return jsonify({
            "success": True,
            "has_previous": True,
            "snapshot_date": latest_snapshot.snapshot_date.isoformat(),
            "balances": balance_dict
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/save-draft", methods=["POST"])
def save_draft():
    """Save or update a draft snapshot"""
    try:
        data = request.get_json()
        
        # Check if updating existing draft
        draft_id = data.get('draft_id')
        
        if draft_id:
            # Update existing draft
            draft = Snapshot.query.get(draft_id)
            if not draft or draft.status != 'draft':
                return jsonify({"success": False, "error": "Draft not found"}), 404
            
            # Update date if changed
            new_date = datetime.strptime(data['snapshot_date'], '%Y-%m-%d').date()
            if draft.snapshot_date != new_date:
                draft.snapshot_date = new_date
            
            # Clear existing balances
            AccountBalance.query.filter_by(snapshot_id=draft_id).delete()
        else:
            # Create new draft
            draft = Snapshot(
                store_id=data['store_id'],
                snapshot_date=datetime.strptime(data['snapshot_date'], '%Y-%m-%d').date(),
                created_by='wizard',
                notes='',
                status='draft'  # Mark as draft
            )
            db.session.add(draft)
            db.session.flush()
        
        # Add account balances
        total_assets = Decimal('0')
        total_liabilities = Decimal('0')
        balance_count = 0
        
        for balance_data in data.get('balances', []):
            account_id = balance_data.get('account_id')
            amount = Decimal(str(balance_data.get('amount', 0)))
            
            if not account_id:
                continue
            
            account = Account.query.get(account_id)
            if not account:
                continue
            
            balance = AccountBalance(
                snapshot_id=draft.id,
                account_id=account_id,
                balance=amount
            )
            db.session.add(balance)
            balance_count += 1
            
            if account.account_type.category == 'Asset':
                total_assets += abs(amount)
            elif account.account_type.category == 'Liability':
                total_liabilities += abs(amount)
        
        # Update totals
        draft.total_assets = total_assets
        draft.total_liabilities = total_liabilities
        draft.net_position = total_assets - total_liabilities
        draft.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "draft_id": draft.id,
            "balance_count": balance_count,
            "message": f"Draft saved successfully with {balance_count} balances"
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error saving draft: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/draft/<int:draft_id>", methods=["GET"])
def get_draft(draft_id):
    """Get a specific draft with all its balances"""
    try:
        draft = Snapshot.query.get(draft_id)
        if not draft or draft.status != 'draft':
            return jsonify({"success": False, "error": "Draft not found"}), 404
        
        # Get all balances with proper account information
        balances = db.session.query(
            AccountBalance.account_id,
            AccountBalance.balance,
            Account.account_name,
            AccountType.category
        ).join(
            Account, AccountBalance.account_id == Account.id
        ).join(
            AccountType, Account.account_type_id == AccountType.id
        ).filter(
            AccountBalance.snapshot_id == draft_id
        ).all()
        
        balance_list = []
        for balance in balances:
            balance_list.append({
                "account_id": balance.account_id,
                "amount": float(balance.balance),
                "account_name": balance.account_name,
                "category": balance.category
            })
        
        store = Store.query.get(draft.store_id)
        
        return jsonify({
            "success": True,
            "draft": {
                "id": draft.id,
                "store_id": draft.store_id,
                "store_name": store.name if store else "Unknown",
                "snapshot_date": draft.snapshot_date.isoformat(),
                "total_assets": float(draft.total_assets) if draft.total_assets else 0,
                "total_liabilities": float(draft.total_liabilities) if draft.total_liabilities else 0,
                "net_position": float(draft.net_position) if draft.net_position else 0,
                "created_at": draft.created_at.isoformat() if draft.created_at else None,
                "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
                "balances": balance_list,
                "balance_count": len(balance_list)
            }
        })
        
    except Exception as e:
        print(f"Error loading draft: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/draft/<int:draft_id>", methods=["DELETE"])
def delete_draft(draft_id):
    """Delete a draft"""
    try:
        draft = Snapshot.query.get(draft_id)
        if not draft or draft.status != 'draft':
            return jsonify({"success": False, "error": "Draft not found"}), 404
        
        # Delete associated balances (cascade should handle this)
        db.session.delete(draft)
        db.session.commit()
        
        return jsonify({"success": True, "message": "Draft deleted"})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/add-account", methods=["POST"])
def add_account():
    """Add a new account to a store"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('store_id'):
            return jsonify({"success": False, "error": "Store ID is required"}), 400
        if not data.get('account_name'):
            return jsonify({"success": False, "error": "Account name is required"}), 400
        if not data.get('account_type_id'):
            return jsonify({"success": False, "error": "Account type is required"}), 400
        
        # Check if account already exists
        existing = Account.query.filter_by(
            store_id=data['store_id'],
            account_name=data['account_name']
        ).first()
        
        if existing:
            if not existing.is_active:
                # Reactivate if it was deactivated
                existing.is_active = True
                db.session.commit()
                return jsonify({
                    "success": True,
                    "account": existing.to_dict(),
                    "message": "Account reactivated successfully"
                })
            else:
                return jsonify({"success": False, "error": "Account already exists"}), 400
        
        # Create new account
        account = Account(
            store_id=data['store_id'],
            account_name=data['account_name'],
            account_type_id=data['account_type_id'],
            bank_id=data.get('bank_id'),
            account_number=data.get('account_number'),
            is_active=True
        )
        
        db.session.add(account)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "account": account.to_dict(),
            "message": "Account added successfully"
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/account-types", methods=["GET"])
def get_account_types():
    """Get all available account types"""
    try:
        account_types = AccountType.query.order_by(AccountType.sort_order).all()
        
        return jsonify({
            "success": True,
            "account_types": [at.to_dict() for at in account_types]
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/account-type", methods=["POST"])
def create_account_type():
    """Create a new account type/category"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"success": False, "error": "Name is required"}), 400
        if not data.get('category'):
            return jsonify({"success": False, "error": "Category is required"}), 400
        
        # Check if exists
        existing = AccountType.query.filter_by(name=data['name']).first()
        if existing:
            return jsonify({"success": False, "error": "Account type already exists"}), 400
        
        account_type = AccountType(
            name=data['name'],
            category=data['category'],
            sort_order=data.get('sort_order', 0)
        )
        
        db.session.add(account_type)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "account_type": account_type.to_dict(),
            "message": "Account type created successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/account-type/<int:type_id>", methods=["PUT"])
def update_account_type(type_id):
    """Update an account type"""
    try:
        data = request.get_json()
        account_type = AccountType.query.get(type_id)
        
        if not account_type:
            return jsonify({"success": False, "error": "Account type not found"}), 404
        
        # Update fields
        if data.get('name'):
            account_type.name = data['name']
        if data.get('category'):
            account_type.category = data['category']
        if 'sort_order' in data:
            account_type.sort_order = data['sort_order']
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "account_type": account_type.to_dict(),
            "message": "Account type updated successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/account-type/<int:type_id>", methods=["DELETE"])
def delete_account_type(type_id):
    """Delete an account type"""
    try:
        account_type = AccountType.query.get(type_id)
        
        if not account_type:
            return jsonify({"success": False, "error": "Account type not found"}), 404
        
        # Check if any accounts use this type
        accounts_count = Account.query.filter_by(account_type_id=type_id).count()
        if accounts_count > 0:
            return jsonify({"success": False, "error": f"Cannot delete: {accounts_count} accounts use this type"}), 400
        
        db.session.delete(account_type)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Account type deleted successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/account/<int:account_id>", methods=["PUT"])
def update_account(account_id):
    """Update an account"""
    try:
        data = request.get_json()
        account = Account.query.get(account_id)
        
        if not account:
            return jsonify({"success": False, "error": "Account not found"}), 404
        
        # Update fields
        if data.get('account_name'):
            account.account_name = data['account_name']
        if data.get('account_type_id'):
            account.account_type_id = data['account_type_id']
        if 'bank_id' in data:
            account.bank_id = data['bank_id']
        if 'account_number' in data:
            account.account_number = data['account_number']
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "account": account.to_dict(),
            "message": "Account updated successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/banks", methods=["GET"])
def get_banks():
    """Get all available banks"""
    try:
        banks = Bank.query.filter_by(is_active=True).order_by(Bank.name).all()
        
        return jsonify({
            "success": True,
            "banks": [bank.to_dict() for bank in banks]
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/bank", methods=["POST"])
def create_bank():
    """Create a new bank"""
    try:
        data = request.get_json()
        
        if not data.get('name'):
            return jsonify({"success": False, "error": "Bank name is required"}), 400
        
        # Check if exists
        existing = Bank.query.filter_by(name=data['name']).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                db.session.commit()
                return jsonify({
                    "success": True,
                    "bank": existing.to_dict(),
                    "message": "Bank reactivated successfully"
                })
            else:
                return jsonify({"success": False, "error": "Bank already exists"}), 400
        
        bank = Bank(
            name=data['name'],
            is_active=True
        )
        
        db.session.add(bank)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "bank": bank.to_dict(),
            "message": "Bank created successfully"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/delete-account/<int:account_id>", methods=["DELETE"])
def delete_account(account_id):
    """Delete an account (soft delete by marking as inactive)"""
    try:
        # Get the account
        account = Account.query.get(account_id)
        
        if not account:
            return jsonify({"success": False, "error": "Account not found"}), 404
        
        # Check if there are any balances for this account
        has_balances = AccountBalance.query.filter_by(account_id=account_id).first() is not None
        
        if has_balances:
            # Soft delete - just mark as inactive
            account.is_active = False
            db.session.commit()
            
            return jsonify({
                "success": True,
                "message": "Account deactivated (has historical data)",
                "soft_delete": True
            })
        else:
            # Hard delete - actually remove the account
            db.session.delete(account)
            db.session.commit()
            
            return jsonify({
                "success": True,
                "message": "Account permanently deleted",
                "soft_delete": False
            })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/bulk-import", methods=["POST"])
def bulk_import_accounts():
    """Bulk import multiple accounts at once"""
    try:
        data = request.get_json()
        accounts_data = data.get('accounts', [])
        
        if not accounts_data:
            return jsonify({"success": False, "error": "No accounts provided"}), 400
        
        # Get all stores for mapping
        stores = {s.name: s for s in Store.query.all()}
        
        # Get all account types for mapping
        account_types = {at.name: at for at in AccountType.query.all()}
        
        # Get all banks for mapping
        banks = {b.name: b for b in Bank.query.all()}
        
        created_count = 0
        skipped_count = 0
        errors = []
        
        for acc_data in accounts_data:
            try:
                # Get or skip store
                store_name = acc_data.get('storeName')
                store = stores.get(store_name)
                if not store:
                    # Try partial match for stores like "Slice Yorktown"
                    for sname, sobj in stores.items():
                        if sname in store_name or store_name in sname:
                            store = sobj
                            break
                    
                    if not store:
                        errors.append(f"Store not found: {store_name}")
                        continue
                
                # Get account type
                account_type_name = acc_data.get('accountType')
                account_type = account_types.get(account_type_name)
                if not account_type:
                    errors.append(f"Account type not found: {account_type_name}")
                    continue
                
                # Get bank (optional)
                bank_name = acc_data.get('bank')
                bank = None
                if bank_name:
                    bank = banks.get(bank_name)
                    if not bank and bank_name not in ['', '-', None]:
                        # Create the bank if it doesn't exist
                        bank = Bank(name=bank_name, is_active=True)
                        db.session.add(bank)
                        db.session.flush()
                        banks[bank_name] = bank
                
                # Check if account already exists
                account_name = acc_data.get('accountName', '')
                existing = Account.query.filter_by(
                    store_id=store.id,
                    account_name=account_name
                ).first()
                
                if existing:
                    # Reactivate if it was deactivated
                    if not existing.is_active:
                        existing.is_active = True
                        created_count += 1
                    else:
                        skipped_count += 1
                    continue
                
                # Create new account
                account = Account(
                    store_id=store.id,
                    account_name=account_name,
                    account_type_id=account_type.id,
                    bank_id=bank.id if bank else None,
                    account_number=acc_data.get('accountNumber'),
                    is_active=True
                )
                db.session.add(account)
                created_count += 1
                
            except Exception as e:
                errors.append(f"Error processing {acc_data.get('accountName', 'unknown')}: {str(e)}")
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "created": created_count,
            "skipped": skipped_count,
            "errors": errors,
            "message": f"Imported {created_count} accounts, skipped {skipped_count} existing"
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/add-intercompany-accounts", methods=["POST"])
def add_intercompany_accounts():
    """Create paired intercompany accounts (receivable for one store, payable for another)"""
    try:
        data = request.get_json()
        
        # Get the two stores involved
        creditor_store_id = data.get('creditor_store_id')  # Store that is owed money
        debtor_store_id = data.get('debtor_store_id')      # Store that owes money
        
        if not creditor_store_id or not debtor_store_id:
            return jsonify({"success": False, "error": "Both stores required"}), 400
        
        if creditor_store_id == debtor_store_id:
            return jsonify({"success": False, "error": "Cannot create intercompany account with same store"}), 400
        
        # Get store names
        creditor_store = Store.query.get(creditor_store_id)
        debtor_store = Store.query.get(debtor_store_id)
        
        if not creditor_store or not debtor_store:
            return jsonify({"success": False, "error": "Invalid store IDs"}), 400
        
        # Get account types
        receivable_type = AccountType.query.filter_by(name='Intercompany Receivable').first()
        payable_type = AccountType.query.filter_by(name='Vendor Payable').first()  # Or create 'Intercompany Payable'
        
        if not receivable_type or not payable_type:
            return jsonify({"success": False, "error": "Required account types not found"}), 400
        
        accounts_created = []
        
        # Create the receivable account for the creditor store
        receivable_name = f"{debtor_store.name} owes {creditor_store.name}"
        existing_receivable = Account.query.filter_by(
            store_id=creditor_store_id,
            account_name=receivable_name
        ).first()
        
        if not existing_receivable:
            receivable_account = Account(
                store_id=creditor_store_id,
                account_name=receivable_name,
                account_type_id=receivable_type.id,
                bank_id=None,  # Internal account
                account_number=None,
                is_active=True
            )
            db.session.add(receivable_account)
            accounts_created.append(receivable_name)
        elif not existing_receivable.is_active:
            existing_receivable.is_active = True
            accounts_created.append(receivable_name + " (reactivated)")
        
        # Create the payable account for the debtor store
        payable_name = f"Owed to {creditor_store.name}"
        existing_payable = Account.query.filter_by(
            store_id=debtor_store_id,
            account_name=payable_name
        ).first()
        
        if not existing_payable:
            payable_account = Account(
                store_id=debtor_store_id,
                account_name=payable_name,
                account_type_id=payable_type.id,
                bank_id=None,  # Internal account
                account_number=None,
                is_active=True
            )
            db.session.add(payable_account)
            accounts_created.append(payable_name)
        elif not existing_payable.is_active:
            existing_payable.is_active = True
            accounts_created.append(payable_name + " (reactivated)")
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": f"Created intercompany accounts between {creditor_store.name} and {debtor_store.name}",
            "accounts": {
                "receivable": f"{receivable_name} (Asset for {creditor_store.name})",
                "payable": f"{payable_name} (Liability for {debtor_store.name})",
                "created": accounts_created
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/intercompany-pairs", methods=["GET"])
def get_intercompany_pairs():
    """Get all intercompany account pairs"""
    try:
        # Find all intercompany receivables
        receivable_type = AccountType.query.filter_by(name='Intercompany Receivable').first()
        
        if not receivable_type:
            return jsonify({
                "success": True,
                "pairs": []
            })
        
        receivables = Account.query.filter_by(
            account_type_id=receivable_type.id,
            is_active=True
        ).all()
        
        pairs = []
        for receivable in receivables:
            # Parse the account name to find the relationship
            # Format: "Store A owes Store B" means Store B has receivable, Store A should have payable
            if " owes " in receivable.account_name:
                parts = receivable.account_name.split(" owes ")
                if len(parts) == 2:
                    debtor_name = parts[0]
                    creditor_store = Store.query.get(receivable.store_id)
                    
                    # Try to find the corresponding payable
                    payable_name_pattern = f"Owed to {creditor_store.name}"
                    payable = Account.query.filter(
                        Account.account_name.like(f"%{payable_name_pattern}%")
                    ).first()
                    
                    pairs.append({
                        "creditor_store": creditor_store.name if creditor_store else "Unknown",
                        "debtor_store": debtor_name,
                        "receivable_account": receivable.account_name,
                        "receivable_id": receivable.id,
                        "payable_account": payable.account_name if payable else "Not found",
                        "payable_id": payable.id if payable else None
                    })
        
        return jsonify({
            "success": True,
            "pairs": pairs
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/store-snapshots/<int:store_id>", methods=["GET"])
def get_store_snapshots(store_id):
    """Get all snapshots for a specific store with filtering"""
    try:
        type_filter = request.args.get('type', 'all')
        
        # Build query
        query = Snapshot.query.filter_by(store_id=store_id)
        
        # Apply type filter
        if type_filter == 'completed':
            query = query.filter_by(status='completed')
        elif type_filter == 'draft':
            query = query.filter_by(status='draft')
        
        # Order by date descending
        snapshots = query.order_by(desc(Snapshot.snapshot_date), desc(Snapshot.id)).all()
        
        snapshots_list = []
        for snapshot in snapshots:
            snapshots_list.append({
                "id": snapshot.id,
                "snapshot_date": snapshot.snapshot_date.isoformat() if snapshot.snapshot_date else None,
                "status": snapshot.status,
                "total_assets": float(snapshot.total_assets) if snapshot.total_assets else 0,
                "total_liabilities": float(snapshot.total_liabilities) if snapshot.total_liabilities else 0,
                "net_position": float(snapshot.net_position) if snapshot.net_position else 0,
                "ytd_sales": float(snapshot.ytd_sales) if snapshot.ytd_sales else 0,
                "ytd_profit": float(snapshot.ytd_profit) if snapshot.ytd_profit else 0,
                "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
                "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None
            })
        
        return jsonify({
            "success": True,
            "snapshots": snapshots_list
        })
        
    except Exception as e:
        print(f"Error getting store snapshots: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/balance-sheet/<int:snapshot_id>", methods=["GET"])
def get_balance_sheet(snapshot_id):
    """Get complete balance sheet data for a snapshot"""
    try:
        # Get snapshot with store info
        snapshot = Snapshot.query.get(snapshot_id)
        if not snapshot:
            return jsonify({"success": False, "error": "Snapshot not found"}), 404
        
        store = Store.query.get(snapshot.store_id)
        
        # Get all account balances with account details
        balances = db.session.query(
            AccountBalance,
            Account,
            AccountType,
            Bank
        ).join(
            Account, AccountBalance.account_id == Account.id
        ).join(
            AccountType, Account.account_type_id == AccountType.id
        ).outerjoin(
            Bank, Account.bank_id == Bank.id
        ).filter(
            AccountBalance.snapshot_id == snapshot_id
        ).order_by(
            AccountType.sort_order,
            Account.account_name
        ).all()
        
        # Organize data for balance sheet
        assets = {
            "bank_accounts": [],
            "merchant_accounts": [],
            "inventory": [],
            "other_assets": [],
            "current_total": Decimal('0'),
            "other_total": Decimal('0')
        }
        
        liabilities = {
            "current_liabilities": [],
            "long_term": [],
            "current_total": Decimal('0'),
            "long_term_total": Decimal('0')
        }
        
        for balance, account, account_type, bank in balances:
            account_data = {
                "account_id": account.id,
                "account_name": account.account_name,
                "account_number": account.account_number,
                "balance": float(balance.balance),
                "type": account_type.name,
                "bank": bank.name if bank else None
            }
            
            if account_type.category == 'Asset':
                if account_type.name in ['Bank Checking', 'Bank Savings']:
                    assets["bank_accounts"].append(account_data)
                    assets["current_total"] += abs(balance.balance)
                elif account_type.name in ['Merchant Account', 'Points']:
                    assets["merchant_accounts"].append(account_data)
                    assets["current_total"] += abs(balance.balance)
                elif account_type.name == 'Inventory':
                    assets["inventory"].append(account_data)
                    assets["current_total"] += abs(balance.balance)
                else:
                    assets["other_assets"].append(account_data)
                    assets["other_total"] += abs(balance.balance)
            
            elif account_type.category == 'Liability':
                # Classify as current or long-term based on type
                if account_type.name in ['Credit Card', 'Vendor Payable', 'Sales Tax Payable',
                                        'Pending Refunds', 'Pending Shipments', 'Management Fee',
                                        'Advertising Payable', 'Shipping Payable', 'Container Duties']:
                    liabilities["current_liabilities"].append(account_data)
                    liabilities["current_total"] += abs(balance.balance)
                else:
                    liabilities["long_term"].append(account_data)
                    liabilities["long_term_total"] += abs(balance.balance)
        
        # Convert decimals to float for JSON serialization
        assets["current_total"] = float(assets["current_total"])
        assets["other_total"] = float(assets["other_total"])
        liabilities["current_total"] = float(liabilities["current_total"])
        liabilities["long_term_total"] = float(liabilities["long_term_total"])
        
        balance_sheet = {
            "id": snapshot.id,
            "store_id": snapshot.store_id,
            "store_name": store.name if store else "Unknown",
            "store_code": store.code if store else "N/A",
            "snapshot_date": snapshot.snapshot_date.isoformat() if snapshot.snapshot_date else None,
            "status": snapshot.status,
            "assets": assets,
            "liabilities": liabilities,
            "total_assets": float(snapshot.total_assets) if snapshot.total_assets else 0,
            "total_liabilities": float(snapshot.total_liabilities) if snapshot.total_liabilities else 0,
            "net_position": float(snapshot.net_position) if snapshot.net_position else 0,
            "ytd_sales": float(snapshot.ytd_sales) if snapshot.ytd_sales else 0,
            "ytd_profit": float(snapshot.ytd_profit) if snapshot.ytd_profit else 0,
            "profit_margin": float(snapshot.profit_margin) if snapshot.profit_margin else 0,
            "created_by": snapshot.created_by,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None
        }
        
        return jsonify({
            "success": True,
            "balance_sheet": balance_sheet
        })
        
    except Exception as e:
        print(f"Error getting balance sheet: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/export-balance-sheet/<int:snapshot_id>", methods=["GET"])
def export_balance_sheet(snapshot_id):
    """Export balance sheet as CSV or JSON"""
    try:
        format_type = request.args.get('format', 'json')
        
        # Get balance sheet data
        response = get_balance_sheet(snapshot_id)
        data = response[0].get_json()
        
        if not data['success']:
            return response
        
        balance_sheet = data['balance_sheet']
        
        if format_type == 'csv':
            # Create CSV export
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.writer(output)
            
            # Write header
            writer.writerow([f"{balance_sheet['store_name']} - Balance Sheet"])
            writer.writerow([f"As of {balance_sheet['snapshot_date']}"])
            writer.writerow([f"Status: {balance_sheet['status'].upper()}"])
            writer.writerow([])
            
            # Assets section
            writer.writerow(["ASSETS"])
            writer.writerow(["Account", "Amount"])
            
            # Bank accounts
            if balance_sheet['assets']['bank_accounts']:
                writer.writerow(["Bank Accounts", ""])
                for account in balance_sheet['assets']['bank_accounts']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            # Merchant accounts
            if balance_sheet['assets']['merchant_accounts']:
                writer.writerow(["Merchant Accounts", ""])
                for account in balance_sheet['assets']['merchant_accounts']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            # Inventory
            if balance_sheet['assets']['inventory']:
                writer.writerow(["Inventory", ""])
                for account in balance_sheet['assets']['inventory']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            # Other assets
            if balance_sheet['assets']['other_assets']:
                writer.writerow(["Other Assets", ""])
                for account in balance_sheet['assets']['other_assets']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            writer.writerow(["TOTAL ASSETS", f"${balance_sheet['total_assets']:.2f}"])
            writer.writerow([])
            
            # Liabilities section
            writer.writerow(["LIABILITIES"])
            
            # Current liabilities
            if balance_sheet['liabilities']['current_liabilities']:
                writer.writerow(["Current Liabilities", ""])
                for account in balance_sheet['liabilities']['current_liabilities']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            # Long-term liabilities
            if balance_sheet['liabilities']['long_term']:
                writer.writerow(["Long-term Liabilities", ""])
                for account in balance_sheet['liabilities']['long_term']:
                    writer.writerow([f"  {account['account_name']}", f"${abs(account['balance']):.2f}"])
            
            writer.writerow(["TOTAL LIABILITIES", f"${balance_sheet['total_liabilities']:.2f}"])
            writer.writerow([])
            
            # Net position
            writer.writerow(["NET POSITION (EQUITY)", f"${balance_sheet['net_position']:.2f}"])
            
            # Performance metrics if available
            if balance_sheet.get('ytd_sales') or balance_sheet.get('ytd_profit'):
                writer.writerow([])
                writer.writerow(["YEAR-TO-DATE PERFORMANCE"])
                if balance_sheet.get('ytd_sales'):
                    writer.writerow(["YTD Sales", f"${balance_sheet['ytd_sales']:.2f}"])
                if balance_sheet.get('ytd_profit'):
                    writer.writerow(["YTD Profit", f"${balance_sheet['ytd_profit']:.2f}"])
                if balance_sheet.get('profit_margin'):
                    writer.writerow(["Profit Margin", f"{balance_sheet['profit_margin']:.2f}%"])
            
            # Create response
            from flask import Response
            
            csv_output = output.getvalue()
            filename = f"balance_sheet_{balance_sheet['store_code']}_{balance_sheet['snapshot_date']}.csv"
            
            return Response(
                csv_output,
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename={filename}'}
            )
        
        else:
            # Return JSON
            return jsonify(data)
    
    except Exception as e:
        print(f"Error exporting balance sheet: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
