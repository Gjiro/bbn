import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory
from flask_cors import CORS
from src.database import db
from src.routes.user import user_bp
from src.routes.api import api_bp
from src.routes.data_import import import_bp
from src.routes.wizard import wizard_bp  # Import the new wizard routes
from src.models.balance_sheet import Store, Account, AccountType, Bank, Snapshot, AccountBalance, WizardSession, HistoricalImport

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config['SECRET_KEY'] = 'asdf#FGSgvasgf$5$WGT'

# Enable CORS for all routes
CORS(app)

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'database', 'app.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)

# Register blueprints
app.register_blueprint(user_bp, url_prefix='/api/users')
app.register_blueprint(api_bp, url_prefix='/api')
app.register_blueprint(wizard_bp, url_prefix='/api/wizard')  # Use different prefix to avoid conflicts
app.register_blueprint(import_bp, url_prefix='/import')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder_path = app.static_folder
    if static_folder_path is None:
        return "Static folder not configured", 404

    # Serve the simple wizard if requested
    if path == 'wizard':
        return send_from_directory(static_folder_path, 'wizard.html')
    # Serve the old dashboard if requested
    elif path == 'dashboard':
        return send_from_directory(static_folder_path, 'index.html')
    elif path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        # Default to the simple wizard
        return send_from_directory(static_folder_path, 'wizard.html')


if __name__ == '__main__':
    with app.app_context():
        # Create tables
        db.create_all()
        print("✓ Database tables created successfully")
        
        # Auto-seed if no stores exist
        from src.models.balance_sheet import Store
        if Store.query.count() == 0:
            from src.routes.data_import import seed_data
            print("→ No stores found, running seed data...")
            with app.test_request_context():
                result = seed_data()
                data = result.get_json()
                if data['success']:
                    print(f"✓ Seed data created:")
                    print(f"  - {data['stats']['stores']} stores")
                    print(f"  - {data['stats']['account_types']} account types")
                    print(f"  - {data['stats']['banks']} banks")
                    print(f"  - {data['stats']['accounts']} accounts")
                else:
                    print(f"✗ Seed data failed: {data['error']}")
        else:
            print(f"✓ Database already has {Store.query.count()} stores")
    
    print("\n" + "="*50)
    print("BALANCE SHEET WIZARD READY!")
    print("="*50)
    print("Access the wizard at: http://localhost:5000")
    print("(Old dashboard at: http://localhost:5000/dashboard)")
    print("="*50 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
