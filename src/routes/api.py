from flask import Blueprint, request, jsonify
from src.database import db
from src.models.balance_sheet import (
    Store, AccountType, Bank, Account, Snapshot,
    AccountBalance, WizardSession, HistoricalImport
)
from sqlalchemy.exc import IntegrityError
from datetime import datetime, date
from decimal import Decimal
import json
from sqlalchemy import func, desc, and_

api_bp = Blueprint("api", __name__)

@api_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "message": "API is running"}), 200

@api_bp.route("/stores", methods=["GET"])
def get_stores():
    """Get all active stores"""
    try:
        stores = Store.query.filter_by(is_active=True).all()
        return jsonify({
            "success": True,
            "stores": [store.to_dict() for store in stores]
        })
    except Exception as e:
        print(f"Error fetching stores: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/accounts", methods=["GET"])
def get_accounts():
    """Get accounts with optional filtering"""
    try:
        store_id = request.args.get("store_id", type=int)
        account_type_id = request.args.get("account_type_id", type=int)
        
        query = Account.query.filter_by(is_active=True)
        
        if store_id:
            query = query.filter_by(store_id=store_id)
        
        if account_type_id:
            query = query.filter_by(account_type_id=account_type_id)
        
        accounts = query.all()
        
        return jsonify({
            "success": True,
            "accounts": [account.to_dict() for account in accounts]
        })
    except Exception as e:
        print(f"Error fetching accounts: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/snapshots", methods=["GET"])
def get_snapshots():
    """Get snapshots with optional filtering"""
    try:
        store_id = request.args.get("store_id", type=int)
        date_from = request.args.get("date_from")
        date_to = request.args.get("date_to")
        limit = request.args.get("limit", 50, type=int)
        
        query = Snapshot.query
        
        if store_id:
            query = query.filter_by(store_id=store_id)
        
        if date_from:
            query = query.filter(Snapshot.snapshot_date >= datetime.strptime(date_from, "%Y-%m-%d").date())
        
        if date_to:
            query = query.filter(Snapshot.snapshot_date <= datetime.strptime(date_to, "%Y-%m-%d").date())
        
        snapshots = query.order_by(desc(Snapshot.snapshot_date)).limit(limit).all()
        
        return jsonify({
            "success": True,
            "snapshots": [snapshot.to_dict() for snapshot in snapshots]
        })
    except Exception as e:
        print(f"Error fetching snapshots: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/snapshots", methods=["POST"])
def create_snapshot():
    """Create a new snapshot"""
    try:
        data = request.get_json()
        
        snapshot = Snapshot(
            store_id=data["store_id"],
            snapshot_date=datetime.strptime(data["snapshot_date"], "%Y-%m-%d").date(),
            created_by=data.get("created_by", "system"),
            notes=data.get("notes", ""),
            status="draft"
        )
        
        db.session.add(snapshot)
        db.session.flush()  # Get the ID
        
        # Add account balances if provided
        if "balances" in data:
            for balance_data in data["balances"]:
                balance = AccountBalance(
                    snapshot_id=snapshot.id,
                    account_id=balance_data["account_id"],
                    balance=Decimal(str(balance_data.get("balance", 0))),
                    points=balance_data.get("points", 0),
                    sales=Decimal(str(balance_data.get("sales", 0))) if balance_data.get("sales") else None,
                    orders=balance_data.get("orders"),
                    spend=Decimal(str(balance_data.get("spend", 0))) if balance_data.get("spend") else None,
                    cpa=Decimal(str(balance_data.get("cpa", 0))) if balance_data.get("cpa") else None,
                    profit=Decimal(str(balance_data.get("profit", 0))) if balance_data.get("profit") else None,
                    notes=balance_data.get("notes", "")
                )
                db.session.add(balance)
        
        # Calculate totals
        calculate_snapshot_totals(snapshot.id)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "snapshot": snapshot.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating snapshot: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/dashboard/summary", methods=["GET"])
def dashboard_summary():
    """Get dashboard summary data"""
    try:
        store_id = request.args.get("store_id", type=int)
        snapshot_date = request.args.get("date", "latest")
        
        # Get latest snapshot for each store or specific store
        if store_id:
            latest_snapshot = Snapshot.query.filter_by(store_id=store_id).order_by(desc(Snapshot.snapshot_date)).first()
            snapshots = [latest_snapshot] if latest_snapshot else []
        else:
            # Get latest snapshot for each store
            subquery = db.session.query(
                Snapshot.store_id,
                func.max(Snapshot.snapshot_date).label("max_date")
            ).group_by(Snapshot.store_id).subquery()
            
            snapshots = db.session.query(Snapshot).join(
                subquery,
                and_(
                    Snapshot.store_id == subquery.c.store_id,
                    Snapshot.snapshot_date == subquery.c.max_date
                )
            ).all()
        
        # Calculate consolidated metrics
        total_assets = sum(s.total_assets or 0 for s in snapshots)
        total_liabilities = sum(s.total_liabilities or 0 for s in snapshots)
        net_position = sum(s.net_position or 0 for s in snapshots)
        ytd_sales = sum(s.ytd_sales or 0 for s in snapshots)
        ytd_profit = sum(s.ytd_profit or 0 for s in snapshots)
        
        # Get store breakdown
        store_breakdown = []
        for snapshot in snapshots:
            store_breakdown.append({
                "store_id": snapshot.store_id,
                "store_name": snapshot.store.name,
                "store_code": snapshot.store.code,
                "snapshot_date": snapshot.snapshot_date.isoformat(),
                "net_position": float(snapshot.net_position or 0),
                "total_assets": float(snapshot.total_assets or 0),
                "total_liabilities": float(snapshot.total_liabilities or 0),
                "ytd_sales": float(snapshot.ytd_sales or 0),
                "ytd_profit": float(snapshot.ytd_profit or 0)
            })
        
        return jsonify({
            "success": True,
            "summary": {
                "total_assets": float(total_assets),
                "total_liabilities": float(total_liabilities),
                "net_position": float(net_position),
                "ytd_sales": float(ytd_sales),
                "ytd_profit": float(ytd_profit),
                "profit_margin": float(ytd_profit / ytd_sales * 100) if ytd_sales > 0 else 0,
                "store_count": len(snapshots),
                "last_updated": max(s.created_at for s in snapshots).isoformat() if snapshots else None
            },
            "stores": store_breakdown
        })
    except Exception as e:
        print(f"Error fetching dashboard summary: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/dashboard/timeline", methods=["GET"])
def dashboard_timeline():
    """Get timeline data for charts"""
    try:
        store_id = request.args.get("store_id", type=int)
        days = request.args.get("days", 30, type=int)
        
        query = Snapshot.query
        if store_id:
            query = query.filter_by(store_id=store_id)
        
        snapshots = query.order_by(desc(Snapshot.snapshot_date)).limit(days).all()
        
        timeline_data = []
        for snapshot in reversed(snapshots):  # Reverse to get chronological order
            timeline_data.append({
                "date": snapshot.snapshot_date.isoformat(),
                "net_position": float(snapshot.net_position or 0),
                "total_assets": float(snapshot.total_assets or 0),
                "total_liabilities": float(snapshot.total_liabilities or 0),
                "ytd_sales": float(snapshot.ytd_sales or 0),
                "ytd_profit": float(snapshot.ytd_profit or 0),
                "store_name": snapshot.store.name
            })
        
        return jsonify({
            "success": True,
            "timeline": timeline_data
        })
    except Exception as e:
        print(f"Error fetching dashboard timeline: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/wizard/session", methods=["POST"])
def create_wizard_session():
    """Create a new wizard session"""
    try:
        data = request.get_json()
        
        session = WizardSession(
            session_id=data["session_id"],
            store_id=data["store_id"],
            snapshot_date=datetime.strptime(data["snapshot_date"], "%Y-%m-%d").date() if data.get("snapshot_date") else None
        )
        
        db.session.add(session)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "session": session.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating wizard session: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/wizard/session/<session_id>", methods=["GET"])
def get_wizard_session(session_id):
    """Get wizard session data"""
    try:
        session = WizardSession.query.filter_by(session_id=session_id).first_or_404()
        return jsonify({
            "success": True,
            "session": session.to_dict()
        })
    except Exception as e:
        print(f"Error fetching wizard session: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/wizard/session/<session_id>/step/<int:step>", methods=["PUT"])
def update_wizard_step(session_id, step):
    """Update wizard step data"""
    try:
        session = WizardSession.query.filter_by(session_id=session_id).first_or_404()
        data = request.get_json()
        
        step_data = json.dumps(data.get("step_data", {}))
        
        if step == 1:
            session.step_1_data = step_data
        elif step == 2:
            session.step_2_data = step_data
        elif step == 3:
            session.step_3_data = step_data
        elif step == 4:
            session.step_4_data = step_data
        elif step == 5:
            session.step_5_data = step_data
        elif step == 6:
            session.step_6_data = step_data
        elif step == 7:
            session.step_7_data = step_data
        
        session.current_step = max(session.current_step, step)
        session.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "session": session.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        print(f"Error updating wizard step: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@api_bp.route("/wizard/session/<session_id>/complete", methods=["POST"])
def complete_wizard_session(session_id):
    """Complete wizard session and create snapshot"""
    try:
        session = WizardSession.query.filter_by(session_id=session_id).first_or_404()
        
        # Create snapshot from wizard data
        snapshot = Snapshot(
            store_id=session.store_id,
            snapshot_date=session.snapshot_date or date.today(),
            created_by="wizard",
            status="completed"
        )
        
        db.session.add(snapshot)
        db.session.flush()
        
        # Process wizard data and create account balances
        # This would parse the JSON data from each step and create AccountBalance records
        
        session.completed_at = datetime.utcnow()
        
        # Calculate totals
        calculate_snapshot_totals(snapshot.id)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "snapshot": snapshot.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        print(f"Error completing wizard session: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

def calculate_snapshot_totals(snapshot_id):
    """Calculate and update snapshot totals"""
    try:
        # Get all balances for this snapshot with account type info
        balances_query = db.session.query(
            AccountBalance, AccountType
        ).join(Account).join(AccountType).filter(
            AccountBalance.snapshot_id == snapshot_id
        ).all()
        
        total_assets = Decimal("0")
        total_liabilities = Decimal("0")
        ytd_sales = Decimal("0")
        ytd_profit = Decimal("0")
        
        for balance, account_type in balances_query:
            if account_type.category == "Asset":
                total_assets += balance.balance or Decimal("0")
            elif account_type.category == "Liability":
                total_liabilities += abs(balance.balance or Decimal("0"))
            
            if balance.sales:
                ytd_sales += balance.sales
            if balance.profit:
                ytd_profit += balance.profit
        
        net_position = total_assets - total_liabilities
        profit_margin = (ytd_profit / ytd_sales * 100) if ytd_sales > 0 else Decimal("0")
        
        # Update snapshot
        snapshot = Snapshot.query.get(snapshot_id)
        snapshot.total_assets = total_assets
        snapshot.total_liabilities = total_liabilities
        snapshot.net_position = net_position
        snapshot.ytd_sales = ytd_sales
        snapshot.ytd_profit = ytd_profit
        snapshot.profit_margin = profit_margin
        
    except Exception as e:
        print(f"Error calculating snapshot totals: {e}")
        raise # Re-raise to ensure rollback in calling function
