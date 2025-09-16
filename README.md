# Elite Era Financial Terminal

A comprehensive balance sheet management system with a cyberpunk-styled dashboard for viewing historical snapshots and a step-by-step wizard for creating new balance sheets.

## Features

### 🎯 **Elite Era Financial Terminal Dashboard**
- **Neon cyberpunk styling** with animated effects and glowing elements
- **Real-time KPI cards** showing Net Position, Assets, Liabilities, and YTD Profit
- **Interactive filters** for selecting snapshots by date and store
- **Timeline charts** for visualizing financial trends
- **Multi-store support** with consolidated and individual store views

### 🧙‍♂️ **Balance Sheet Creation Wizard**
- **Step 1: Store Selection** - Choose which store/entity to create a snapshot for
- **Step 2: Bank Balances** - Enter balances for all bank accounts (dynamically loaded based on store)
- **Step 3: Inventory & Assets** - Record inventory values, investments, and other assets
- **Step 4: Liabilities** - Enter credit card balances, loans, and other liabilities
- **Step 5: Review & Save** - Review all entered data and save the snapshot

### 🗄️ **Comprehensive Database Schema**
- **Stores**: All business locations and entities
- **Account Types**: Checking, Credit Cards, Investments, etc.
- **Banks**: Chase, Capital One, merchant accounts, etc.
- **Accounts**: Individual bank accounts with credit limits and balances
- **Snapshots**: Historical balance sheet records with calculated totals
- **Wizard Sessions**: Session management for step-by-step data entry

## Installation & Setup

### Prerequisites
- Python 3.8 or higher
- pip (Python package installer)

### Local Development Setup

1. **Extract the project files** to your desired directory (e.g., `desktop/EliteEraApp/balance-sheet`)

2. **Navigate to the project directory:**
   ```bash
   cd balance_sheet_system
   ```

3. **Create a virtual environment:**
   ```bash
   python3 -m venv venv
   ```

4. **Activate the virtual environment:**
   ```bash
   # On macOS/Linux:
   source venv/bin/activate
   
   # On Windows:
   venv\Scripts\activate
   ```

5. **Install dependencies:**
   ```bash
   pip install Flask Flask-SQLAlchemy Flask-Migrate Flask-CORS python-dotenv
   ```

6. **Run the application:**
   ```bash
   python src/main.py
   ```

7. **Access the dashboard:**
   Open your web browser and go to `http://localhost:5000`

## Database Setup

The application uses SQLite for local development. The database is automatically created when you first run the application.

### Automatic Database Creation
- Database file: `src/database/app.db`
- Tables are created automatically on first run
- Sample data is seeded for testing

### Manual Database Commands (if needed)
```bash
# Create database tables
python -c "from src.main import app, db; app.app_context().push(); db.create_all()"

# Seed initial data
curl -X POST http://localhost:5000/import/seed
```

## API Endpoints

### Dashboard
- `GET /api/dashboard/summary` - Get dashboard summary data
- `GET /api/dashboard/timeline` - Get timeline data for charts

### Stores
- `GET /api/stores` - Get all active stores
- `GET /api/stores/{id}` - Get specific store details

### Snapshots
- `GET /api/snapshots` - Get snapshots with filtering
- `POST /api/snapshots` - Create a new snapshot
- `GET /api/snapshots/{id}` - Get specific snapshot with balances

### Wizard
- `POST /api/wizard/session` - Create new wizard session
- `GET /api/wizard/session/{id}` - Get wizard session data
- `PUT /api/wizard/session/{id}/step/{step}` - Update wizard step data
- `POST /api/wizard/session/{id}/complete` - Complete wizard and create snapshot

### Accounts & Reference Data
- `GET /api/accounts` - Get accounts with filtering
- `GET /api/account-types` - Get all account types
- `GET /api/banks` - Get all banks

## Project Structure

```
balance_sheet_system/
├── src/
│   ├── main.py                 # Flask application entry point
│   ├── database.py             # Database initialization
│   ├── models/
│   │   ├── user.py            # User model (from template)
│   │   └── balance_sheet.py   # Balance sheet models
│   ├── routes/
│   │   ├── user.py            # User routes (from template)
│   │   ├── api.py             # Main API endpoints
│   │   └── data_import.py     # Data import and seeding
│   ├── static/
│   │   ├── index.html         # Main dashboard HTML
│   │   ├── styles.css         # Cyberpunk styling
│   │   └── dashboard.js       # Frontend JavaScript
│   └── database/
│       └── app.db             # SQLite database file
├── requirements.txt           # Python dependencies
└── README.md                 # This file
```

## Usage

### Creating a New Balance Sheet Snapshot

1. **Access the Dashboard**: Go to `http://localhost:5000`
2. **Click "NEW SNAPSHOT"**: This opens the wizard modal
3. **Select Store**: Choose which store/entity you're creating a snapshot for
4. **Enter Bank Balances**: Fill in current balances for all accounts
5. **Add Inventory & Assets**: Record inventory values and other assets
6. **Enter Liabilities**: Add credit card balances and other debts
7. **Review & Save**: Verify all data and save the snapshot

### Viewing Historical Data

- Use the **date filter** to select specific time periods
- Use the **store filter** to view data for specific locations
- Click on **snapshot cards** to view detailed balance information
- Use the **timeline chart** to visualize trends over time

## Customization

### Adding New Stores
Edit the `seed_initial_data()` function in `src/routes/data_import.py` to add new stores.

### Adding New Account Types
Add new account types in the same seeding function with appropriate categories (Asset/Liability).

### Styling Modifications
Edit `src/static/styles.css` to customize the cyberpunk theme colors and effects.

## Troubleshooting

### Common Issues

1. **Database not found**: The database is created automatically. If issues persist, delete `src/database/app.db` and restart.

2. **Port already in use**: If port 5000 is busy, modify the port in `src/main.py`:
   ```python
   app.run(host='0.0.0.0', port=5001, debug=True)
   ```

3. **Module import errors**: Ensure you're in the correct directory and the virtual environment is activated.

### Development Mode
The application runs in debug mode by default, which provides:
- Automatic reloading on code changes
- Detailed error messages
- Interactive debugger

## Support

For issues or questions about the Elite Era Financial Terminal, please refer to this documentation or check the code comments for implementation details.

## License

This project is proprietary software developed for Elite Era business operations.

