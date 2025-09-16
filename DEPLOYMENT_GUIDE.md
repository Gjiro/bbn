# Elite Era Financial Terminal - Deployment Guide

## Quick Start (Local Development)

### 1. Download & Extract
Download the project zip file and extract it to your desired location:
```bash
# Example: Extract to your desktop
cd ~/Desktop/EliteEraApp
unzip balance_sheet_system.zip
cd balance_sheet_system
```

### 2. Setup Virtual Environment
```bash
# Create virtual environment
python3 -m venv venv

# Activate it (macOS/Linux)
source venv/bin/activate

# Activate it (Windows)
venv\Scripts\activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the Application
```bash
python src/main.py
```

### 5. Access the Dashboard
Open your browser and go to: `http://localhost:5000`

## Database Commands

The database is created automatically when you first run the application. However, if you need to manually manage it:

### Create Database Tables
```bash
python -c "from src.main import app, db; app.app_context().push(); db.create_all()"
```

### Seed Initial Data (Stores, Account Types, Banks)
```bash
curl -X POST http://localhost:5000/import/seed
```

### View Database Schema (SQLite)
```bash
sqlite3 src/database/app.db ".schema"
```

### View Tables
```bash
sqlite3 src/database/app.db ".tables"
```

### Query Data Examples
```bash
# View all stores
sqlite3 src/database/app.db "SELECT * FROM stores;"

# View all account types
sqlite3 src/database/app.db "SELECT * FROM account_types;"

# View all snapshots
sqlite3 src/database/app.db "SELECT * FROM snapshots;"
```

## Testing the System

### 1. Verify Dashboard Loads
- Go to `http://localhost:5000`
- You should see the Elite Era Financial Terminal with neon styling
- KPI cards should display (may show $0 initially)

### 2. Test the Wizard
- Click "NEW SNAPSHOT" button
- Select a store (e.g., "Seal Skin")
- Proceed through each step:
  - Bank Balances: Enter test amounts
  - Inventory & Assets: Add inventory values
  - Liabilities: Enter any debts
  - Review & Save: Complete the snapshot

### 3. Verify Data Persistence
- After creating a snapshot, refresh the dashboard
- The KPI cards should update with your entered data
- You should see the new snapshot in the timeline

### 4. Test API Endpoints
```bash
# Test health check
curl http://localhost:5000/api/stores

# Test dashboard summary
curl http://localhost:5000/api/dashboard/summary

# Test snapshots
curl http://localhost:5000/api/snapshots
```

## Production Deployment (Optional)

### Using Gunicorn (Recommended for Production)
```bash
# Install Gunicorn
pip install gunicorn

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 src.main:app
```

### Environment Variables
Create a `.env` file in the project root:
```
FLASK_ENV=production
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///src/database/app.db
```

### Docker Deployment (Advanced)
Create a `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ./src/
EXPOSE 5000

CMD ["python", "src/main.py"]
```

Build and run:
```bash
docker build -t elite-era-terminal .
docker run -p 5000:5000 elite-era-terminal
```

## Troubleshooting

### Common Issues

1. **Port 5000 already in use**
   ```bash
   # Kill process using port 5000
   lsof -ti:5000 | xargs kill -9
   
   # Or change port in src/main.py
   app.run(host='0.0.0.0', port=5001, debug=True)
   ```

2. **Module not found errors**
   ```bash
   # Ensure virtual environment is activated
   source venv/bin/activate
   
   # Reinstall dependencies
   pip install -r requirements.txt
   ```

3. **Database permission errors**
   ```bash
   # Ensure database directory exists and is writable
   mkdir -p src/database
   chmod 755 src/database
   ```

4. **CSS/JS not loading**
   - Check that `src/static/` directory contains all files
   - Verify Flask is serving static files correctly
   - Clear browser cache

### Logs and Debugging

Enable debug mode (already enabled by default):
```python
# In src/main.py
app.run(host='0.0.0.0', port=5000, debug=True)
```

View Flask logs in the terminal where you ran `python src/main.py`.

### Performance Optimization

For better performance in production:
1. Set `debug=False` in `src/main.py`
2. Use a production WSGI server like Gunicorn
3. Consider using PostgreSQL instead of SQLite for larger datasets
4. Enable gzip compression for static files

## Backup and Maintenance

### Database Backup
```bash
# Backup SQLite database
cp src/database/app.db src/database/app_backup_$(date +%Y%m%d).db
```

### Regular Maintenance
- Monitor disk space (SQLite database will grow over time)
- Regular backups of the database file
- Update dependencies periodically: `pip install -r requirements.txt --upgrade`

## Support

If you encounter issues:
1. Check this deployment guide
2. Review the main README.md
3. Check Flask and SQLAlchemy documentation
4. Verify all dependencies are installed correctly

