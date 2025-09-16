from flask import Blueprint, jsonify, request
from src.models.balance_sheet import (
    db, Store, AccountType, Bank, Account, Snapshot,
    AccountBalance, HistoricalImport
)

import_bp = Blueprint('import', __name__)

@import_bp.route('/seed', methods=['POST'])
def seed_data():
    """Create comprehensive seed data matching the Excel balance sheet structure"""
    try:
        # Create stores
        stores_data = [
            {'code': 'SEAL', 'name': 'Seal Skin', 'is_active': True},
            {'code': 'BOAT', 'name': 'BoatCover', 'is_active': True},
            {'code': 'JSC', 'name': 'JetSkiCover', 'is_active': True},
            {'code': 'DEB', 'name': 'Debonair', 'is_active': True},
            {'code': 'UTV', 'name': 'UTV Cover', 'is_active': True},
            {'code': 'YORK', 'name': 'Slice Yorktown', 'is_active': True},
            {'code': 'SOM', 'name': 'Slice Somers', 'is_active': True},
        ]
        
        created_stores = {}
        for store_data in stores_data:
            store = Store.query.filter_by(code=store_data['code']).first()
            if not store:
                store = Store(**store_data)
                db.session.add(store)
                db.session.flush()
            created_stores[store.code] = store
        
        # Create account types
        account_types_data = [
            # Assets
            {'name': 'Bank Checking', 'category': 'Asset', 'sort_order': 1},
            {'name': 'Bank Savings', 'category': 'Asset', 'sort_order': 2},
            {'name': 'Merchant Account', 'category': 'Asset', 'sort_order': 3},
            {'name': 'Intercompany Receivable', 'category': 'Asset', 'sort_order': 4},
            {'name': 'Points', 'category': 'Asset', 'sort_order': 5},
            {'name': 'Inventory', 'category': 'Asset', 'sort_order': 6},
            {'name': 'Order Receivable', 'category': 'Asset', 'sort_order': 7},
            {'name': 'Tax Refund', 'category': 'Asset', 'sort_order': 8},
            {'name': 'Loan Receivable', 'category': 'Asset', 'sort_order': 9},
            # Liabilities
            {'name': 'Management Fee', 'category': 'Liability', 'sort_order': 20},
            {'name': 'Advertising Payable', 'category': 'Liability', 'sort_order': 21},
            {'name': 'Pending Refunds', 'category': 'Liability', 'sort_order': 22},
            {'name': 'Pending Shipments', 'category': 'Liability', 'sort_order': 23},
            {'name': 'Shipping Payable', 'category': 'Liability', 'sort_order': 24},
            {'name': 'Credit Card', 'category': 'Liability', 'sort_order': 25},
            {'name': 'Container Duties', 'category': 'Liability', 'sort_order': 26},
            {'name': 'Sales Tax Payable', 'category': 'Liability', 'sort_order': 27},
            {'name': 'Vendor Payable', 'category': 'Liability', 'sort_order': 28},
            {'name': 'Rent Payable', 'category': 'Liability', 'sort_order': 29},
        ]
        
        created_types = {}
        for at_data in account_types_data:
            account_type = AccountType.query.filter_by(name=at_data['name']).first()
            if not account_type:
                account_type = AccountType(**at_data)
                db.session.add(account_type)
                db.session.flush()
            created_types[account_type.name] = account_type
        
        # Create banks
        banks_data = [
            {'name': 'Chase', 'is_active': True},
            {'name': 'Capital One', 'is_active': True},
            {'name': 'Amazon', 'is_active': True},
            {'name': 'PayPal', 'is_active': True},
            {'name': 'Shopify', 'is_active': True},
            {'name': 'Points System', 'is_active': True},
            {'name': 'Internal', 'is_active': True},
        ]
        
        created_banks = {}
        for bank_data in banks_data:
            bank = Bank.query.filter_by(name=bank_data['name']).first()
            if not bank:
                bank = Bank(**bank_data)
                db.session.add(bank)
                db.session.flush()
            created_banks[bank.name] = bank
        
        # Create accounts for each store
        for store_code, store in created_stores.items():
            accounts_to_create = []
            
            # Bank Accounts (Assets)
            accounts_to_create.extend([
                {
                    'account_name': f'{store.name} - Chase Checking',
                    'account_type_id': created_types['Bank Checking'].id,
                    'bank_id': created_banks['Chase'].id,
                    'account_number': '3456'
                },
                {
                    'account_name': f'{store.name} - Capital One',
                    'account_type_id': created_types['Bank Checking'].id,
                    'bank_id': created_banks['Capital One'].id,
                    'account_number': '1234'
                }
            ])
            
            # Merchant Accounts (Assets)
            accounts_to_create.extend([
                {
                    'account_name': f'{store.name} - Amazon',
                    'account_type_id': created_types['Merchant Account'].id,
                    'bank_id': created_banks['Amazon'].id,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - PayPal',
                    'account_type_id': created_types['Merchant Account'].id,
                    'bank_id': created_banks['PayPal'].id,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Shopify/Merchant',
                    'account_type_id': created_types['Merchant Account'].id,
                    'bank_id': created_banks['Shopify'].id,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Points',
                    'account_type_id': created_types['Points'].id,
                    'bank_id': created_banks['Points System'].id,
                    'account_number': None
                }
            ])
            
            # Intercompany Receivables (for Seal Skin only)
            if store.code == 'SEAL':
                accounts_to_create.extend([
                    {
                        'account_name': 'BC owes Seal Skin',
                        'account_type_id': created_types['Intercompany Receivable'].id,
                        'bank_id': created_banks['Internal'].id,
                        'account_number': None
                    },
                    {
                        'account_name': 'Debonair owes Seal Skin',
                        'account_type_id': created_types['Intercompany Receivable'].id,
                        'bank_id': created_banks['Internal'].id,
                        'account_number': None
                    },
                    {
                        'account_name': 'JSC owes Seal Skin',
                        'account_type_id': created_types['Intercompany Receivable'].id,
                        'bank_id': created_banks['Internal'].id,
                        'account_number': None
                    },
                    {
                        'account_name': 'UTV owes Seal Skin',
                        'account_type_id': created_types['Intercompany Receivable'].id,
                        'bank_id': created_banks['Internal'].id,
                        'account_number': None
                    }
                ])
            
            # Inventory (Asset)
            accounts_to_create.append({
                'account_name': f'{store.name} - Live Inventory',
                'account_type_id': created_types['Inventory'].id,
                'bank_id': None,
                'account_number': None
            })
            
            # Order Receivables (Assets)
            accounts_to_create.extend([
                {
                    'account_name': f'{store.name} - Order Q2 2025 Anma',
                    'account_type_id': created_types['Order Receivable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Order Q2 2025 Homful',
                    'account_type_id': created_types['Order Receivable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Order Q3 2025 Anma',
                    'account_type_id': created_types['Order Receivable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Order Q3 2025 Homful',
                    'account_type_id': created_types['Order Receivable'].id,
                    'bank_id': None,
                    'account_number': None
                }
            ])
            
            # Other Assets
            accounts_to_create.extend([
                {
                    'account_name': f'{store.name} - IRS REFUND PTET',
                    'account_type_id': created_types['Tax Refund'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - CarLoans',
                    'account_type_id': created_types['Loan Receivable'].id,
                    'bank_id': None,
                    'account_number': None
                }
            ])
            
            # Liabilities
            accounts_to_create.extend([
                {
                    'account_name': f'{store.name} - 7a Management Fee',
                    'account_type_id': created_types['Management Fee'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - AdsBing',
                    'account_type_id': created_types['Advertising Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - AdsGoogle',
                    'account_type_id': created_types['Advertising Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - AdsMeta',
                    'account_type_id': created_types['Advertising Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Pending Refunds',
                    'account_type_id': created_types['Pending Refunds'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Pending Shipments',
                    'account_type_id': created_types['Pending Shipments'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - UPS/DHL/USPS Carriers',
                    'account_type_id': created_types['Shipping Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Credit Card',
                    'account_type_id': created_types['Credit Card'].id,
                    'bank_id': created_banks['Chase'].id,
                    'account_number': '9876'
                },
                {
                    'account_name': f'{store.name} - Container Duties Due',
                    'account_type_id': created_types['Container Duties'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Sales Tax owed',
                    'account_type_id': created_types['Sales Tax Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - Balkans.io',
                    'account_type_id': created_types['Vendor Payable'].id,
                    'bank_id': None,
                    'account_number': None
                },
                {
                    'account_name': f'{store.name} - WorldWeav',
                    'account_type_id': created_types['Vendor Payable'].id,
                    'bank_id': None,
                    'account_number': None
                }
            ])
            
            # Rent accounts (only for physical stores)
            if store.code in ['YORK', 'SOM']:
                accounts_to_create.extend([
                    {
                        'account_name': f'{store.name} - Rent Brewster',
                        'account_type_id': created_types['Rent Payable'].id,
                        'bank_id': None,
                        'account_number': None
                    },
                    {
                        'account_name': f'{store.name} - Rent Hartford',
                        'account_type_id': created_types['Rent Payable'].id,
                        'bank_id': None,
                        'account_number': None
                    }
                ])
            
            # Create all accounts for this store
            for account_data in accounts_to_create:
                existing = Account.query.filter_by(
                    store_id=store.id,
                    account_name=account_data['account_name']
                ).first()
                
                if not existing:
                    account = Account(
                        store_id=store.id,
                        **account_data,
                        is_active=True
                    )
                    db.session.add(account)
        
        db.session.commit()
        
        # Count created records
        total_stores = Store.query.count()
        total_account_types = AccountType.query.count()
        total_banks = Bank.query.count()
        total_accounts = Account.query.count()
        
        return jsonify({
            'success': True,
            'message': 'Seed data created successfully',
            'stats': {
                'stores': total_stores,
                'account_types': total_account_types,
                'banks': total_banks,
                'accounts': total_accounts
            }
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
