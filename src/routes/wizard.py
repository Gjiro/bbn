from flask import Blueprint, request, jsonify
from src.database import db
from src.models.balance_sheet import (
    Store, AccountType, Bank, Account, Snapshot,
    AccountBalance, WizardSession
)
from sqlalchemy.exc import IntegrityError
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
                total_assets += amount
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

# ===== DRAFT ENDPOINTS =====

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
            
            if account.account_type.category == 'Asset':
                total_assets += amount
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
            "message": "Draft saved successfully"
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/drafts", methods=["GET"])
def get_drafts():
    """Get all draft snapshots"""
    try:
        drafts = Snapshot.query.filter_by(status='draft').order_by(Snapshot.updated_at.desc()).all()
        
        draft_list = []
        for draft in drafts:
            store = Store.query.get(draft.store_id)
            balance_count = AccountBalance.query.filter_by(snapshot_id=draft.id).count()
            
            draft_list.append({
                "id": draft.id,
                "store_id": draft.store_id,
                "store_name": store.name if store else "Unknown",
                "snapshot_date": draft.snapshot_date.isoformat(),
                "total_assets": float(draft.total_assets),
                "total_liabilities": float(draft.total_liabilities),
                "net_position": float(draft.net_position),
                "balance_count": balance_count,
                "created_at": draft.created_at.isoformat(),
                "updated_at": draft.updated_at.isoformat()
            })
        
        return jsonify({
            "success": True,
            "drafts": draft_list
        })
        
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@wizard_bp.route("/draft/<int:draft_id>", methods=["GET"])
def get_draft(draft_id):
    """Get a specific draft with all its balances"""
    try:
        draft = Snapshot.query.get(draft_id)
        if not draft or draft.status != 'draft':
            return jsonify({"success": False, "error": "Draft not found"}), 404
        
        # Get all balances
        balances = AccountBalance.query.filter_by(snapshot_id=draft_id).all()
        
        balance_list = []
        for balance in balances:
            balance_list.append({
                "account_id": balance.account_id,
                "amount": float(balance.balance)
            })
        
        store = Store.query.get(draft.store_id)
        
        return jsonify({
            "success": True,
            "draft": {
                "id": draft.id,
                "store_id": draft.store_id,
                "store_name": store.name if store else "Unknown",
                "snapshot_date": draft.snapshot_date.isoformat(),
                "total_assets": float(draft.total_assets),
                "total_liabilities": float(draft.total_liabilities),
                "net_position": float(draft.net_position),
                "balances": balance_list
            }
        })
        
    except Exception as e:
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

# ===== ACCOUNT MANAGEMENT ENDPOINTS =====

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
