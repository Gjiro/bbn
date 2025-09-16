from src.database import db
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime, date
from decimal import Decimal
import json

class User(db.Model):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(128))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class Store(db.Model):
    __tablename__ = 'stores'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    accounts = relationship('Account', backref='store', lazy=True)
    snapshots = relationship('Snapshot', backref='store', lazy=True)
    wizard_sessions = relationship('WizardSession', backref='store', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class AccountType(db.Model):
    __tablename__ = 'account_types'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)  # 'Asset' or 'Liability'
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    accounts = relationship('Account', backref='account_type', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'sort_order': self.sort_order,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class Bank(db.Model):
    __tablename__ = 'banks'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    accounts = relationship('Account', backref='bank', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class Account(db.Model):
    __tablename__ = 'accounts'
    id = Column(Integer, primary_key=True)
    store_id = Column(Integer, ForeignKey('stores.id'), nullable=False)
    account_type_id = Column(Integer, ForeignKey('account_types.id'), nullable=False)
    bank_id = Column(Integer, ForeignKey('banks.id'), nullable=True)
    account_name = Column(String(200), nullable=False)
    account_number = Column(String(50), nullable=True)
    available_credit = Column(Numeric(10, 2), default=0.00)
    total_credit = Column(Numeric(10, 2), default=0.00)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'store_id': self.store_id,
            'account_type_id': self.account_type_id,
            'bank_id': self.bank_id,
            'account_name': self.account_name,
            'account_number': self.account_number,
            'available_credit': float(self.available_credit) if self.available_credit is not None else None,
            'total_credit': float(self.total_credit) if self.total_credit is not None else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'account_type': self.account_type.to_dict() if self.account_type else None,
            'bank': self.bank.to_dict() if self.bank else None
        }

class Snapshot(db.Model):
    __tablename__ = 'snapshots'
    id = Column(Integer, primary_key=True)
    store_id = Column(Integer, ForeignKey('stores.id'), nullable=False)
    snapshot_date = Column(DateTime, nullable=False)
    net_position = Column(Numeric(10, 2), default=0.00)
    total_assets = Column(Numeric(10, 2), default=0.00)
    total_liabilities = Column(Numeric(10, 2), default=0.00)
    ytd_sales = Column(Numeric(10, 2), default=0.00)
    ytd_profit = Column(Numeric(10, 2), default=0.00)
    profit_margin = Column(Numeric(5, 2), default=0.00)
    created_by = Column(String(100), default='system')
    notes = Column(Text, nullable=True)
    status = Column(String(50), default='draft')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account_balances = relationship('AccountBalance', backref='snapshot', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'store_id': self.store_id,
            'snapshot_date': self.snapshot_date.isoformat(),
            'net_position': float(self.net_position) if self.net_position is not None else None,
            'total_assets': float(self.total_assets) if self.total_assets is not None else None,
            'total_liabilities': float(self.total_liabilities) if self.total_liabilities is not None else None,
            'ytd_sales': float(self.ytd_sales) if self.ytd_sales is not None else None,
            'ytd_profit': float(self.ytd_profit) if self.ytd_profit is not None else None,
            'profit_margin': float(self.profit_margin) if self.profit_margin is not None else None,
            'created_by': self.created_by,
            'notes': self.notes,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'store': self.store.to_dict() if self.store else None
        }

class AccountBalance(db.Model):
    __tablename__ = 'account_balances'
    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey('snapshots.id'), nullable=False)
    account_id = Column(Integer, ForeignKey('accounts.id'), nullable=False)
    balance = Column(Numeric(10, 2), nullable=False)
    points = Column(Integer, default=0)
    sales = Column(Numeric(10, 2), nullable=True)
    orders = Column(Integer, nullable=True)
    spend = Column(Numeric(10, 2), nullable=True)
    cpa = Column(Numeric(10, 2), nullable=True)
    profit = Column(Numeric(10, 2), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account = relationship('Account', backref='account_balances', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'snapshot_id': self.snapshot_id,
            'account_id': self.account_id,
            'balance': float(self.balance) if self.balance is not None else None,
            'points': self.points,
            'sales': float(self.sales) if self.sales is not None else None,
            'orders': self.orders,
            'spend': float(self.spend) if self.spend is not None else None,
            'cpa': float(self.cpa) if self.cpa is not None else None,
            'profit': float(self.profit) if self.profit is not None else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class WizardSession(db.Model):
    __tablename__ = 'wizard_sessions'
    id = Column(Integer, primary_key=True)
    session_id = Column(String(255), unique=True, nullable=False)
    store_id = Column(Integer, ForeignKey('stores.id'), nullable=False)
    snapshot_date = Column(DateTime, nullable=True)
    current_step = Column(Integer, default=1)
    step_1_data = Column(Text, nullable=True)
    step_2_data = Column(Text, nullable=True)
    step_3_data = Column(Text, nullable=True)
    step_4_data = Column(Text, nullable=True)
    step_5_data = Column(Text, nullable=True)
    step_6_data = Column(Text, nullable=True)
    step_7_data = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'store_id': self.store_id,
            'snapshot_date': self.snapshot_date.isoformat() if self.snapshot_date else None,
            'current_step': self.current_step,
            'step_1_data': json.loads(self.step_1_data) if self.step_1_data else {},
            'step_2_data': json.loads(self.step_2_data) if self.step_2_data else {},
            'step_3_data': json.loads(self.step_3_data) if self.step_3_data else {},
            'step_4_data': json.loads(self.step_4_data) if self.step_4_data else {},
            'step_5_data': json.loads(self.step_5_data) if self.step_5_data else {},
            'step_6_data': json.loads(self.step_6_data) if self.step_6_data else {},
            'step_7_data': json.loads(self.step_7_data) if self.step_7_data else {},
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

class HistoricalImport(db.Model):
    __tablename__ = 'historical_imports'
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    import_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default='pending')
    notes = Column(Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'import_date': self.import_date.isoformat(),
            'status': self.status,
            'notes': self.notes
        }
