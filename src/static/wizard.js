// Global state
let sessionId = null;
let currentStoreId = null;
let storeAccounts = {};
let currentDraftId = null;
let allStores = [];
let currentDraftBalances = {};
let accountToMove = null;
let accountToEdit = null;
let categoryToEdit = null;
let currentSettingsSection = 'drafts';
let dashboardData = {
    totalAssets: 0,
    totalLiabilities: 0,
    netPosition: 0,
    ytdProfit: 0,
    stores: []
};
let chartInstances = {};

// Inventory Helper State
let masterSKUData = null;
let currentInventoryAccountId = null;

// Reports Tab State
let currentBalanceSheet = null;
let comparisonMode = false;
let currentSnapshot = null;
let compareSnapshot = null;


// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    initializeWizard();
    document.getElementById('storeSelect').addEventListener('change', onStoreChange);

    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('snapshotDate').value = today;

    // Initialize drag and drop
    initializeDragAndDrop();

    // Load settings content
    showSettingsSection('drafts');

    // Load Elite Era Dashboard on startup if dashboard tab exists
    if (document.getElementById('dashboardTab')) {
        loadEliteEraDashboard();
        initializeCharts();
    }
});

// Tab switching (MERGED)
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Set active tab button
    event.target.classList.add('active');

    // If switching to settings, reload current section
    if (tabName === 'settings' && currentSettingsSection) {
        showSettingsSection(currentSettingsSection);
    }

    // If switching to dashboard, refresh data
    if (tabName === 'dashboard') {
        loadEliteEraDashboard();
    }
    
    // If switching to reports, initialize it
    if (tabName === 'reports') {
        initializeReportsTab();
    }
}


// Toggle category collapse
function toggleCategory(category) {
    const header = event.currentTarget;
    const content = document.getElementById(category + 'Content');

    header.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

// Initialize wizard
async function initializeWizard() {
    showLoading(true);
    try {
        const response = await fetch('/api/wizard/initialize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'}
        });
        const data = await response.json();

        if (data.success) {
            sessionId = data.session_id;
            allStores = data.stores;
            populateStores(data.stores);
        } else {
            showMessage('Failed to initialize: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Populate store dropdown
function populateStores(stores) {
    const select = document.getElementById('storeSelect');
    select.innerHTML = '<option value="">Select Store...</option>';

    stores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        option.textContent = `${store.name} (${store.code})`;
        select.appendChild(option);
    });
}

// Handle store selection
async function onStoreChange() {
    const storeId = document.getElementById('storeSelect').value;
    if (!storeId) {
        clearAccountSections();
        return;
    }

    currentStoreId = storeId;
    showLoading(true);

    try {
        const response = await fetch(`/api/wizard/accounts/${storeId}`);
        const data = await response.json();

        if (data.success) {
            storeAccounts = data.accounts;
            renderAccounts();

            if (currentDraftId && currentDraftBalances) {
                restoreDraftValues();
            }
        } else {
            showMessage('Failed to load accounts: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Render accounts with drag handles and helper buttons
function renderAccounts() {
    renderAccountSection('bankAccounts', storeAccounts.bank_accounts);
    renderAccountSection('merchantAccounts', storeAccounts.merchant_accounts);
    renderAccountSection('inventory', storeAccounts.inventory, true); // Enable helpers for inventory
    renderAccountSection('receivables', storeAccounts.receivables);
    renderAccountSection('liabilities', storeAccounts.liabilities);

    // Add input listeners
    document.querySelectorAll('.account-input').forEach(input => {
        input.addEventListener('input', function() {
            updateSummary();
            if (this.value && parseFloat(this.value) !== 0) {
                this.classList.add('has-value');
            } else {
                this.classList.remove('has-value');
            }
        });
    });

    updateSummary();
}

// Render a section of accounts with optional inventory helpers
function renderAccountSection(containerId, accounts, showInventoryHelpers = false) {
    const container = document.getElementById(containerId);
    if (!accounts || accounts.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 13px;">No accounts available</p>';
        return;
    }

    let html = '';
    accounts.forEach(account => {
        const isInventoryAccount = account.type === 'Inventory' || account.name.includes('Inventory');
        html += `
            <div class="account-row" draggable="true" data-account-id="${account.id}">
                <span class="drag-handle">☰</span>
                <label class="account-label">${account.name}</label>
                <input type="number" 
                       class="account-input" 
                       data-account-id="${account.id}"
                       data-category="${account.category}"
                       placeholder="0.00" 
                       step="0.01">
                <div class="account-actions">
                    ${showInventoryHelpers && isInventoryAccount ? `
                        <button class="btn-small btn-helper" onclick="showInventoryHelper(${account.id}, '${account.name}')" title="Inventory Helper">
                            📊
                        </button>
                    ` : ''}
                    <button class="btn-small" onclick="showMoveOptions(${account.id}, '${account.name}')">⚙️</button>
                    <button class="btn-small" onclick="deleteAccount(${account.id}, '${account.name}')">🗑️</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Show Inventory Helper Modal
function showInventoryHelper(accountId, accountName) {
    currentInventoryAccountId = accountId;

    // Create or update the inventory helper modal
    let modal = document.getElementById('inventoryHelperModal');
    if (!modal) {
        const modalHtml = `
            <div id="inventoryHelperModal" class="modal-overlay">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3>📊 Inventory Helper - <span id="inventoryAccountName"></span></h3>
                        <button onclick="closeInventoryHelper()" class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="inventory-helper-section">
                            <h4>Master SKU List (One-time Setup)</h4>
                            <div class="form-group">
                                <label>Upload Master SKU CSV:</label>
                                <input type="file" id="masterSKUFile" accept=".csv" onchange="loadMasterSKU(this)">
                                <small style="display: block; margin-top: 5px; color: #666;">
                                    Required columns: Column B (SKU), Column D (Per Unit Rate)
                                </small>
                            </div>
                            <div id="masterSKUStatus" style="margin-top: 10px;"></div>
                        </div>
                        
                        <hr style="margin: 20px 0;">
                        
                        <div class="inventory-helper-section">
                            <h4>Calculate Inventory Values</h4>
                            
                            <div class="inventory-calc-option">
                                <h5>📦 FBA (Amazon) Inventory</h5>
                                <div class="form-group">
                                    <input type="file" id="fbaInventoryFile" accept=".csv">
                                    <button class="btn btn-primary" onclick="processFBAInventory()" style="margin-top: 10px;">
                                        Calculate FBA Value
                                    </button>
                                </div>
                                <div id="fbaResult" class="result-box"></div>
                            </div>
                            
                            <div class="inventory-calc-option" style="margin-top: 20px;">
                                <h5>🏭 Warehouse Inventory</h5>
                                <div class="form-group">
                                    <input type="file" id="warehouseInventoryFile" accept=".csv">
                                    <button class="btn btn-primary" onclick="processWarehouseInventory()" style="margin-top: 10px;">
                                        Calculate Warehouse Value
                                    </button>
                                </div>
                                <div id="warehouseResult" class="result-box"></div>
                            </div>
                            
                            <div class="inventory-calc-option" style="margin-top: 20px;">
                                <h5>💰 Total Inventory Value</h5>
                                <div class="total-inventory-value">
                                    <span>FBA Value:</span> <span id="fbaValue">$0.00</span><br>
                                    <span>Warehouse Value:</span> <span id="warehouseValue">$0.00</span><br>
                                    <hr style="margin: 10px 0;">
                                    <strong>Total:</strong> <strong id="totalInventoryValue">$0.00</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeInventoryHelper()">Cancel</button>
                        <button class="btn btn-success" onclick="applyInventoryValue()">Apply Total Value</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    document.getElementById('inventoryAccountName').textContent = accountName;
    document.getElementById('inventoryHelperModal').classList.add('active');
}

// Close Inventory Helper
function closeInventoryHelper() {
    document.getElementById('inventoryHelperModal').classList.remove('active');
    // Reset values
    document.getElementById('fbaValue').textContent = '$0.00';
    document.getElementById('warehouseValue').textContent = '$0.00';
    document.getElementById('totalInventoryValue').textContent = '$0.00';
    document.getElementById('fbaResult').innerHTML = '';
    document.getElementById('warehouseResult').innerHTML = '';
}

// Load Master SKU Data - Fixed for correct column mapping
function loadMasterSKU(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csv = e.target.result;
            const rows = parseCSV(csv);
            
            masterSKUData = {};
            let count = 0;
            let sampleSkus = [];
            
            rows.forEach((row, index) => {
                if (index === 0) return; // Skip header
                
                // SKU is column B (index 1), Per Unit Rate is column D (index 3)
                const sku = row[1]; // Column B - SKU
                const rateString = row[3] || '0'; // Column D - Per Unit Rate
                
                // Clean the rate string (remove $, commas, etc)
                const rate = parseFloat(rateString.replace(/[$,]/g, '')) || 0;
                
                if (sku && rate > 0) {
                    // Store with uppercase for case-insensitive matching
                    const skuUpper = sku.trim().toUpperCase();
                    masterSKUData[skuUpper] = rate;
                    count++;
                    
                    // Keep some samples for debugging
                    if (sampleSkus.length < 10) {
                        sampleSkus.push(`${skuUpper}: $${rate}`);
                    }
                }
            });
            
            document.getElementById('masterSKUStatus').innerHTML =
                `<span style="color: green;">✔ Loaded ${count} SKUs from master list</span>`;
            
            // Store in localStorage for persistence
            localStorage.setItem('masterSKUData', JSON.stringify(masterSKUData));
            
            console.log("Master SKUs loaded successfully!");
            console.log("Sample SKUs:", sampleSkus);
            console.log(`Total SKUs loaded: ${count}`);
            
        } catch (error) {
            document.getElementById('masterSKUStatus').innerHTML =
                `<span style="color: red;">Error: ${error.message}</span>`;
            console.error("Error loading master SKU file:", error);
        }
    };
    reader.readAsText(file);
}

// Process FBA Inventory
function processFBAInventory() {
    const fileInput = document.getElementById('fbaInventoryFile');
    const file = fileInput.files[0];

    if (!file) {
        showMessage('Please select an FBA inventory file', 'error');
        return;
    }

    if (!masterSKUData) {
        const stored = localStorage.getItem('masterSKUData');
        if (stored) {
            masterSKUData = JSON.parse(stored);
        } else {
            showMessage('Please load the Master SKU list first', 'error');
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csv = e.target.result;
            const rows = parseCSV(csv);
            
            let totalValue = 0;
            let matchedCount = 0;
            let unmatchedSkus = [];
            
            rows.forEach((row, index) => {
                if (index === 0) return; // Skip header
                
                // FBA file: SKU is column 2 (index 1), available is column 7 (index 6)
                let sku = row[1] || ''; // Column 2 - sku
                const qty = parseInt(row[6]) || 0; // Column 7 - available
                
                // Remove _FBA or -fba suffix if present
                sku = sku.replace(/_FBA|-fba/gi, '').trim().toUpperCase();
                
                if (masterSKUData[sku] && qty > 0) {
                    const value = qty * masterSKUData[sku];
                    totalValue += value;
                    matchedCount++;
                } else if (sku && qty > 0) {
                    unmatchedSkus.push(`${sku} (Qty: ${qty})`);
                }
            });
            
            // Update display
            document.getElementById('fbaValue').textContent = formatCurrency(totalValue);
            document.getElementById('fbaResult').innerHTML = `
                <div style="color: green; margin-top: 10px;">
                    ✔ Processed ${matchedCount} SKUs<br>
                    Total FBA Value: ${formatCurrency(totalValue)}
                    ${unmatchedSkus.length > 0 ? 
                        `<br><small style="color: orange;">⚠ ${unmatchedSkus.length} unmatched SKUs</small>
                         <br><small style="font-size: 10px;">First few unmatched: ${unmatchedSkus.slice(0,5).join(', ')}</small>` 
                        : ''}
                </div>
            `;
            
            updateTotalInventoryValue();
            
        } catch (error) {
            document.getElementById('fbaResult').innerHTML =
                `<span style="color: red;">Error: ${error.message}</span>`;
        }
    };
    reader.readAsText(file);
}

// Process Warehouse Inventory
function processWarehouseInventory() {
    const fileInput = document.getElementById('warehouseInventoryFile');
    const file = fileInput.files[0];

    if (!file) {
        showMessage('Please select a warehouse inventory file', 'error');
        return;
    }

    if (!masterSKUData) {
        const stored = localStorage.getItem('masterSKUData');
        if (stored) {
            masterSKUData = JSON.parse(stored);
        } else {
            showMessage('Please load the Master SKU list first', 'error');
            return;
        }
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csv = e.target.result;
            const rows = parseCSV(csv);
            
            let totalValue = 0;
            let matchedCount = 0;
            let unmatchedSkus = [];
            let debugInfo = [];
            
            rows.forEach((row, index) => {
                if (index === 0) return; // Skip header
                
                // Warehouse file: SKU is column 4 (index 3)
                const originalSku = (row[3] || '').trim();
                // Remove quotes if present and convert to uppercase
                const sku = originalSku.replace(/^"|"$/g, '').toUpperCase();
                
                const onHand = parseInt(row[6]) || 0; // Column G - on hand
                const allocated = parseInt(row[7]) || 0; // Column H - allocated
                const currentStock = onHand - allocated;
                
                if (currentStock > 0 && sku) {
                    // Try exact match
                    if (masterSKUData[sku]) {
                        const rate = masterSKUData[sku];
                        const value = currentStock * rate;
                        totalValue += value;
                        matchedCount++;
                        
                        // Keep first few matches for display
                        if (debugInfo.length < 3) {
                            debugInfo.push(`${sku}: ${currentStock} units × $${rate.toFixed(2)} = $${value.toFixed(2)}`);
                        }
                    } else {
                        unmatchedSkus.push(`${sku} (Stock: ${currentStock})`);
                    }
                }
            });
            
            console.log(`Warehouse processing complete: ${matchedCount} matched, ${unmatchedSkus.length} unmatched`);
            if (debugInfo.length > 0) {
                console.log("Sample matches:", debugInfo);
            }
            
            // Update display
            document.getElementById('warehouseValue').textContent = formatCurrency(totalValue);
            
            let resultHtml = `<div style="color: ${matchedCount > 0 ? 'green' : 'orange'}; margin-top: 10px;">`;
            if (matchedCount > 0) {
                resultHtml += `✔ Processed ${matchedCount} SKUs<br>`;
                resultHtml += `Total Warehouse Value: ${formatCurrency(totalValue)}`;
                if (debugInfo.length > 0) {
                    resultHtml += `<br><small style="color: #666; font-size: 11px;">Example: ${debugInfo[0]}</small>`;
                }
            } else {
                resultHtml += `⚠ No SKUs matched!<br>`;
                resultHtml += `Please verify your files are in the correct format.`;
            }
            
            if (unmatchedSkus.length > 0) {
                resultHtml += `<br><small style="color: orange;">⚠ ${unmatchedSkus.length} unmatched SKUs</small>`;
                if (unmatchedSkus.length <= 5) {
                    resultHtml += `<br><small style="font-size: 10px;">Unmatched: ${unmatchedSkus.join(', ')}</small>`;
                } else {
                    resultHtml += `<br><small style="font-size: 10px;">First few unmatched: ${unmatchedSkus.slice(0,3).join(', ')}</small>`;
                }
            }
            
            resultHtml += '</div>';
            document.getElementById('warehouseResult').innerHTML = resultHtml;
            
            updateTotalInventoryValue();
            
        } catch (error) {
            document.getElementById('warehouseResult').innerHTML =
                `<span style="color: red;">Error: ${error.message}</span>`;
            console.error("Error processing warehouse inventory:", error);
        }
    };
    reader.readAsText(file);
}

// Update Total Inventory Value
function updateTotalInventoryValue() {
    const fbaText = document.getElementById('fbaValue').textContent;
    const warehouseText = document.getElementById('warehouseValue').textContent;

    const fbaValue = parseFloat(fbaText.replace(/[$,]/g, '')) || 0;
    const warehouseValue = parseFloat(warehouseText.replace(/[$,]/g, '')) || 0;

    const total = fbaValue + warehouseValue;
    document.getElementById('totalInventoryValue').textContent = formatCurrency(total);
}

// Apply Inventory Value to Account
function applyInventoryValue() {
    const totalText = document.getElementById('totalInventoryValue').textContent;
    const totalValue = parseFloat(totalText.replace(/[$,]/g, '')) || 0;

    if (totalValue === 0) {
        showMessage('No inventory value calculated', 'error');
        return;
    }

    // Find the input for this account and set the value
    const input = document.querySelector(`input[data-account-id="${currentInventoryAccountId}"]`);
    if (input) {
        input.value = totalValue.toFixed(2);
        input.classList.add('has-value');
        updateSummary();
        showMessage(`Applied inventory value of ${formatCurrency(totalValue)}`, 'success');
        closeInventoryHelper();
    } else {
        showMessage('Could not find the account input field', 'error');
    }
}

// Parse CSV Helper
function parseCSV(csv) {
    const lines = csv.split('\n');
    const rows = [];

    lines.forEach(line => {
        if (line.trim()) {
            // Simple CSV parsing - may need enhancement for quoted values
            const columns = line.split(',').map(col => col.trim());
            rows.push(columns);
        }
    });

    return rows;
}

// Initialize drag and drop
function initializeDragAndDrop() {
    document.addEventListener('dragstart', function(e) {
        if (e.target.classList.contains('account-row')) {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.innerHTML);
        }
    });

    document.addEventListener('dragend', function(e) {
        if (e.target.classList.contains('account-row')) {
            e.target.classList.remove('dragging');
        }
    });

    document.addEventListener('dragover', function(e) {
        e.preventDefault();
    });

    document.addEventListener('drop', function(e) {
        e.preventDefault();
        // Handle drop logic here
    });
}

// Settings section management
function showSettingsSection(section) {
    currentSettingsSection = section;

    // Update active menu item only if event exists and has a target
    if (typeof event !== 'undefined' && event && event.target) {
        document.querySelectorAll('.settings-menu-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.classList.add('active');
    } else {
        // If called programmatically, find and activate the right menu item
        document.querySelectorAll('.settings-menu-item').forEach(item => {
            if (item) {
                item.classList.remove('active');
                if (item.textContent && item.textContent.toLowerCase().includes(section)) {
                    item.classList.add('active');
                }
            }
        });
    }

    const content = document.getElementById('settingsContent');

    switch(section) {
        case 'drafts':
            loadDraftsSection();
            break;
        case 'categories':
            loadCategoriesSection();
            break;
        case 'accounts':
            loadAccountsSection();
            break;
        case 'move':
            loadMoveSection();
            break;
        case 'import':
            loadImportSection();
            break;
        case 'helpers':
            loadHelpersSection();
            break;
    }
}

// Load Helpers Section
function loadHelpersSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = `
        <h2>🔧 Line Item Helpers</h2>
        <div class="helpers-container">
            <div class="helper-section">
                <h3>📦 Inventory Helpers</h3>
                <p>Inventory helpers allow you to calculate inventory values from CSV files:</p>
                <ul style="margin-left: 20px;">
                    <li><strong>Master SKU List:</strong> Upload once with SKU prices (Column B: SKU, Column D: Per Unit Rate)</li>
                    <li><strong>FBA Inventory:</strong> Calculate Amazon FBA inventory value</li>
                    <li><strong>Warehouse Inventory:</strong> Calculate warehouse inventory value</li>
                </ul>
                <p style="margin-top: 15px;">To use inventory helpers:</p>
                <ol style="margin-left: 20px;">
                    <li>Go to Balance Entry tab</li>
                    <li>Select a store</li>
                    <li>Find an inventory account</li>
                    <li>Click the 📊 button next to the account</li>
                    <li>Upload your CSV files and calculate values</li>
                </ol>
            </div>
            
            <div class="helper-section" style="margin-top: 30px;">
                <h3>🚀 Coming Soon</h3>
                <p>More helpers will be added for:</p>
                <ul style="margin-left: 20px;">
                    <li>Bank reconciliation</li>
                    <li>Merchant account balance imports</li>
                    <li>Accounts receivable aging</li>
                    <li>Accounts payable tracking</li>
                </ul>
            </div>
        </div>
    `;
}

// Load drafts section
async function loadDraftsSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = '<h2>📋 Pending Drafts</h2><div>Loading...</div>';

    try {
        const response = await fetch('/api/wizard/drafts');
        const data = await response.json();

        if (data.success && data.drafts.length > 0) {
            let html = '<h2>📋 Pending Drafts</h2>';
            html += '<div class="category-list">';
            
            data.drafts.forEach(draft => {
                html += `
                    <div class="category-item">
                        <div>
                            <div class="category-item-name">
                                ${draft.store_name} - ${draft.snapshot_date}
                                <span class="draft-badge">${draft.balance_count} balances</span>
                            </div>
                            <small style="color: #666;">Updated: ${new Date(draft.updated_at).toLocaleString()}</small>
                        </div>
                        <div class="category-item-actions">
                            <button class="btn-small" onclick="loadSpecificDraft(${draft.id})">Load</button>
                            <button class="btn-small" onclick="deleteDraftFromSettings(${draft.id})">Delete</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            content.innerHTML = html;
        } else {
            content.innerHTML = '<h2>📋 Pending Drafts</h2><p>No drafts found</p>';
        }
    } catch (error) {
        content.innerHTML = '<h2>📋 Pending Drafts</h2><p style="color: red;">Failed to load drafts</p>';
    }
}

// Load categories section with full CRUD
async function loadCategoriesSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = '<h2>📚 Categories Management</h2><div>Loading...</div>';

    try {
        const response = await fetch('/api/wizard/account-types');
        const data = await response.json();

        if (data.success) {
            let html = `
                <h2>📚 Categories Management</h2>
                <button class="btn-primary" onclick="openAddCategoryModal()" style="margin-bottom: 20px;">+ Add New Category</button>
                <div class="category-list">
            `;
            
            data.account_types.forEach(type => {
                html += `
                    <div class="category-item">
                        <div>
                            <div class="category-item-name">${type.name}</div>
                            <small style="color: #666;">Category: ${type.category} | Order: ${type.sort_order}</small>
                        </div>
                        <div class="category-item-actions">
                            <button class="btn-small" onclick="editCategory(${type.id}, '${type.name}', '${type.category}', ${type.sort_order})">Edit</button>
                            <button class="btn-small" onclick="deleteCategory(${type.id}, '${type.name}')">Delete</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            content.innerHTML = html;
        } else {
            content.innerHTML = '<h2>📚 Categories Management</h2><p style="color: red;">Failed to load categories</p>';
        }
    } catch (error) {
        content.innerHTML = '<h2>📚 Categories Management</h2><p style="color: red;">Error: ' + error.message + '</p>';
    }
}

// Load accounts section with full management
async function loadAccountsSection() {
    const content = document.getElementById('settingsContent');

    if (!currentStoreId) {
        content.innerHTML = `
            <h2>💼 All Accounts</h2>
            <p>Please select a store first from the Balance Entry tab</p>
        `;
        return;
    }

    content.innerHTML = '<h2>💼 All Accounts</h2><div>Loading...</div>';

    try {
        const response = await fetch(`/api/wizard/accounts/${currentStoreId}`);
        const data = await response.json();

        if (data.success) {
            // Combine all accounts
            const allAccounts = [
                ...data.accounts.bank_accounts || [],
                ...data.accounts.merchant_accounts || [],
                ...data.accounts.inventory || [],
                ...data.accounts.receivables || [],
                ...data.accounts.liabilities || []
            ];
            
            let html = `
                <h2>💼 All Accounts - ${data.store.name}</h2>
                <button class="btn-primary" onclick="openAddAccountModal()" style="margin-bottom: 20px;">+ Add New Account</button>
                <input type="text" id="accountSearch" placeholder="Search accounts..." style="margin-bottom: 20px; width: 100%;" class="form-input" onkeyup="filterAccounts()">
                <div class="category-list" id="accountsList">
            `;
            
            allAccounts.forEach(account => {
                html += `
                    <div class="category-item account-item" data-account-name="${account.name.toLowerCase()}">
                        <div>
                            <div class="category-item-name">${account.name}</div>
                            <small style="color: #666;">Type: ${account.type} | Category: ${account.category} | Bank: ${account.bank || 'N/A'}</small>
                        </div>
                        <div class="category-item-actions">
                            <button class="btn-small" onclick="editAccount(${account.id}, '${account.name}', '${account.type}', '${account.bank || ''}', '${account.account_number || ''}')">Edit</button>
                            <button class="btn-small" onclick="showMoveOptions(${account.id}, '${account.name}')">Move</button>
                            <button class="btn-small" onclick="deleteAccount(${account.id}, '${account.name}')">Delete</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            content.innerHTML = html;
        } else {
            content.innerHTML = '<h2>💼 All Accounts</h2><p style="color: red;">Failed to load accounts</p>';
        }
    } catch (error) {
        content.innerHTML = '<h2>💼 All Accounts</h2><p style="color: red;">Error: ' + error.message + '</p>';
    }
}

// Load move section
function loadMoveSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = `
        <h2>🔄 Move Accounts</h2>
        <p>To move accounts between categories:</p>
        <ol>
            <li>Go to the "All Accounts" section</li>
            <li>Click the "Move" button next to any account</li>
            <li>Select the new category and subcategory</li>
            <li>Confirm the move</li>
        </ol>
        <button class="btn-primary" onclick="showSettingsSection('accounts')">Go to All Accounts</button>
    `;
}

// Load import section
function loadImportSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = `
        <h2>📥 Bulk Import</h2>
        <button class="btn-primary" onclick="openBulkImportModal()" style="margin-bottom: 20px;">Start Bulk Import</button>
        <div class="format-help" style="background: #f8f9fa; padding: 15px; border-radius: 4px;">
            <strong>How to use Bulk Import:</strong><br><br>
            1. Prepare your data in this format: <code>Category  StoreName  Bank/Type  AccountName</code><br>
            2. Click "Start Bulk Import" above<br>
            3. Paste your data and preview<br>
            4. Confirm to import all accounts at once<br><br>
            <strong>Example:</strong><br>
            <code>Asset  Seal Skin  Chase  PLAT BUS CHECKING (...0172)</code><br>
            <code>Liability  Seal Skin  Vendor  WorldWeav</code>
        </div>
    `;
}

// Elite Era Dashboard Functions
async function loadEliteEraDashboard(includeDrafts = false) {
    showLoading(true);
    try {
        // Get dashboard summary data
        const url = includeDrafts ? '/api/dashboard/summary?include_drafts=true' : '/api/dashboard/summary';
        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            dashboardData = data.summary;
            dashboardData.stores = data.stores;
            dashboardData.storesWithOnlyDrafts = data.stores_with_only_drafts;
            
            // Update main KPIs
            updateEliteKPIs();
            
            // Update store breakdown
            updateStoreBreakdown();
            
            // Update charts
            updateDashboardCharts();
            
            // Update last updated time
            const lastUpdatedElement = document.getElementById('lastUpdated');
            if (lastUpdatedElement) {
                lastUpdatedElement.textContent = `Last updated: ${new Date().toLocaleString()}`;
            }
        }
    } catch (error) {
        showMessage('Failed to load dashboard data: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function updateEliteKPIs() {
    // Update main KPIs with animation
    animateValue('eliteTotalAssets', 0, dashboardData.total_assets, 1000, true);
    animateValue('eliteTotalLiabilities', 0, dashboardData.total_liabilities, 1000, true);
    animateValue('eliteNetPosition', 0, dashboardData.net_position, 1000, true);
    animateValue('eliteYtdProfit', 0, dashboardData.ytd_profit || 0, 1000, true);

    // Update trends
    const assetsTrend = document.getElementById('assetsTrend');
    const liabilitiesTrend = document.getElementById('liabilitiesTrend');
    const netPositionTrend = document.getElementById('netPositionTrend');
    const profitTrend = document.getElementById('profitTrend');

    if (assetsTrend) assetsTrend.textContent = '↑ +5.2%';
    if (liabilitiesTrend) liabilitiesTrend.textContent = '↓ -2.1%';
    if (netPositionTrend) {
        netPositionTrend.textContent = dashboardData.net_position >= 0 ? '↑ +8.3%' : '↓ -8.3%';
        netPositionTrend.className = dashboardData.net_position >= 0 ? 'kpi-trend positive' : 'kpi-trend negative';
    }
    if (profitTrend) profitTrend.textContent = '↑ +12.5%';
}

function animateValue(id, start, end, duration, isCurrency = false) {
    const element = document.getElementById(id);
    if (!element) return;

    const range = end - start;
    const increment = range / (duration / 16); // 60 FPS
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = isCurrency ? formatCurrency(current) : current.toFixed(0);
    }, 16);
}

function updateStoreBreakdown() {
    const container = document.getElementById('storesBreakdownGrid');
    if (!container) return;

    let html = '';

    if (!dashboardData.stores || dashboardData.stores.length === 0) {
        html = '<p style="text-align: center; color: #999;">No completed snapshots available</p>';
        
        // Show stores that only have drafts if any
        if (dashboardData.storesWithOnlyDrafts && dashboardData.storesWithOnlyDrafts.length > 0) {
            html += '<div style="text-align: center; margin-top: 20px;">';
            html += '<p style="color: #f39c12; font-size: 14px;">📋 The following stores have drafts only:</p>';
            html += '<ul style="list-style: none; padding: 0; margin-top: 10px;">';
            dashboardData.storesWithOnlyDrafts.forEach(store => {
                html += `<li style="margin: 5px 0;">${store.store_name} (${store.store_code})</li>`;
            });
            html += '</ul>';
            html += '<button class="btn btn-warning" onclick="toggleDraftDisplay()" style="margin-top: 15px;">Show Drafts</button>';
            html += '</div>';
        }
    } else {
        dashboardData.stores.forEach((store, index) => {
            const netPositionClass = store.net_position >= 0 ? 'positive' : 'negative';
            const profitClass = store.ytd_profit >= 0 ? 'positive' : 'negative';
            const isDraft = store.status === 'draft';
            
            html += `
                <div class="store-breakdown-card${isDraft ? ' draft-card' : ''}" style="animation-delay: ${index * 0.1}s">
                    <h4>
                        🏪 ${store.store_name} (${store.store_code})
                        ${isDraft ? '<span class="draft-badge">DRAFT</span>' : ''}
                    </h4>
                    <div class="store-metric-row">
                        <span class="metric-label">Net Position:</span>
                        <span class="metric-value ${netPositionClass}">${formatCurrency(store.net_position)}</span>
                    </div>
                    <div class="store-metric-row">
                        <span class="metric-label">Total Assets:</span>
                        <span class="metric-value positive">${formatCurrency(store.total_assets)}</span>
                    </div>
                    <div class="store-metric-row">
                        <span class="metric-label">Total Liabilities:</span>
                        <span class="metric-value negative">${formatCurrency(store.total_liabilities)}</span>
                    </div>
                    <div class="store-metric-row">
                        <span class="metric-label">YTD Sales:</span>
                        <span class="metric-value">${formatCurrency(store.ytd_sales)}</span>
                    </div>
                    <div class="store-metric-row">
                        <span class="metric-label">YTD Profit:</span>
                        <span class="metric-value ${profitClass}">${formatCurrency(store.ytd_profit)}</span>
                    </div>
                    <div class="store-metric-row">
                        <span class="metric-label">Snapshot Date:</span>
                        <span class="metric-value">${store.snapshot_date || 'N/A'}</span>
                    </div>
                    ${store.updated_at ? `
                    <div class="store-metric-row" style="font-size: 11px; opacity: 0.7;">
                        <span class="metric-label">Last Modified:</span>
                        <span class="metric-value">${new Date(store.updated_at).toLocaleString()}</span>
                    </div>` : ''}
                </div>
            `;
        });
        
        // Add note if showing drafts
        if (dashboardData.summary && dashboardData.summary.showing_drafts) {
            html = '<div style="background: #fff3cd; padding: 10px; border-radius: 4px; margin-bottom: 15px; text-align: center;">' +
                   '<p style="color: #856404; margin: 0;">⚠️ Showing draft snapshots. <button class="btn-small" onclick="toggleDraftDisplay()">Hide Drafts</button></p>' +
                   '</div>' + html;
        }
    }

    container.innerHTML = html;
}

// Add function to toggle draft display
function toggleDraftDisplay() {
    const currentlyShowingDrafts = dashboardData.summary && dashboardData.summary.showing_drafts;
    loadEliteEraDashboard(!currentlyShowingDrafts);
}

function initializeCharts() {
    // Initialize Asset Distribution Chart
    const assetCtx = document.getElementById('assetChart');
    const trendCtx = document.getElementById('trendChart');

    if (assetCtx) {
        chartInstances.assetChart = new Chart(assetCtx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#667eea',
                        '#764ba2',
                        '#00b894',
                        '#00d2d3',
                        '#f8b500',
                        '#ee5a6f',
                        '#4ecdc4'
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    if (trendCtx) {
        chartInstances.trendChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Net Position',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    }
}

function updateDashboardCharts() {
    // Update Asset Distribution Chart
    if (chartInstances.assetChart && dashboardData.stores) {
        const labels = dashboardData.stores.map(s => s.store_name);
        const data = dashboardData.stores.map(s => s.total_assets);
        
        chartInstances.assetChart.data.labels = labels;
        chartInstances.assetChart.data.datasets[0].data = data;
        chartInstances.assetChart.update();
    }

    // Update Trend Chart - this would need historical data
    // For now, we'll create mock data
    if (chartInstances.trendChart) {
        const last30Days = [];
        const trendData = [];
        
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            last30Days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            // Mock data - in reality, fetch from API
            trendData.push(dashboardData.net_position * (0.9 + Math.random() * 0.2));
        }
        
        chartInstances.trendChart.data.labels = last30Days;
        chartInstances.trendChart.data.datasets[0].data = trendData;
        chartInstances.trendChart.update();
    }
}

async function refreshDashboard() {
    await loadEliteEraDashboard();
    showMessage('Dashboard refreshed successfully!', 'success');
}

function exportDashboard() {
    // Create CSV export of dashboard data
    let csv = 'ELITE ERA DASHBOARD EXPORT\n';
    csv += `Generated: ${new Date().toLocaleString()}\n\n`;
    csv += 'SUMMARY\n';
    csv += `Total Assets,${dashboardData.total_assets}\n`;
    csv += `Total Liabilities,${dashboardData.total_liabilities}\n`;
    csv += `Net Position,${dashboardData.net_position}\n`;
    csv += `YTD Profit,${dashboardData.ytd_profit || 0}\n\n`;
    csv += 'STORE BREAKDOWN\n';
    csv += 'Store,Net Position,Assets,Liabilities,YTD Sales,YTD Profit\n';

    dashboardData.stores.forEach(store => {
        csv += `${store.store_name},${store.net_position},${store.total_assets},${store.total_liabilities},${store.ytd_sales},${store.ytd_profit}\n`;
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elite_era_dashboard_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showMessage('Dashboard exported successfully!', 'success');
}

function generateMonthlyReport() {
    showMessage('Monthly report generation coming soon!', 'info');
}

function generateYearlyReport() {
    showMessage('Yearly report generation coming soon!', 'info');
}

// Filter accounts in the accounts list
function filterAccounts() {
    const searchTerm = document.getElementById('accountSearch').value.toLowerCase();
    const accounts = document.querySelectorAll('.account-item');

    accounts.forEach(account => {
        const name = account.dataset.accountName;
        if (name.includes(searchTerm)) {
            account.style.display = 'block';
        } else {
            account.style.display = 'none';
        }
    });
}

// Category management functions
function openAddCategoryModal() {
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('categoryModal');
    if (!modal) {
        const modalHtml = `
            <div id="categoryModal" class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="categoryModalTitle">Add New Category</h3>
                        <button onclick="closeCategoryModal()" class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Category Name:</label>
                            <input type="text" id="categoryName" class="form-input" placeholder="e.g., Bank Checking">
                        </div>
                        <div class="form-group">
                            <label>Type:</label>
                            <select id="categoryType" class="form-input">
                                <option value="Asset">Asset</option>
                                <option value="Liability">Liability</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Sort Order:</label>
                            <input type="number" id="categorySortOrder" class="form-input" value="0" min="0">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeCategoryModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="saveCategory()">Save Category</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Reset form
    document.getElementById('categoryModalTitle').textContent = 'Add New Category';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryType').value = 'Asset';
    document.getElementById('categorySortOrder').value = '0';
    categoryToEdit = null;

    // Show modal
    document.getElementById('categoryModal').classList.add('active');
}

function editCategory(id, name, category, sortOrder) {
    openAddCategoryModal();
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryName').value = name;
    document.getElementById('categoryType').value = category;
    document.getElementById('categorySortOrder').value = sortOrder;
    categoryToEdit = id;
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    categoryToEdit = null;
}

async function saveCategory() {
    const name = document.getElementById('categoryName').value;
    const category = document.getElementById('categoryType').value;
    const sortOrder = parseInt(document.getElementById('categorySortOrder').value) || 0;

    if (!name) {
        showMessage('Please enter a category name', 'error');
        return;
    }

    showLoading(true);
    try {
        const url = categoryToEdit
            ? `/api/wizard/account-type/${categoryToEdit}`
            : '/api/wizard/account-type';
        
        const method = categoryToEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: name,
                category: category,
                sort_order: sortOrder
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(categoryToEdit ? 'Category updated successfully' : 'Category created successfully', 'success');
            closeCategoryModal();
            loadCategoriesSection();
        } else {
            showMessage('Failed to save category: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteCategory(id, name) {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;

    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/account-type/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Category deleted successfully', 'success');
            loadCategoriesSection();
        } else {
            showMessage('Failed to delete category: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Account management functions
function openAddAccountModal() {
    document.getElementById('addAccountModal').classList.add('active');
    loadAccountTypesAndBanks();
}

function closeAddAccountModal() {
    document.getElementById('addAccountModal').classList.remove('active');
}

async function loadAccountTypesAndBanks() {
    try {
        // Load account types
        const typesResponse = await fetch('/api/wizard/account-types');
        const typesData = await typesResponse.json();
        
        if (typesData.success) {
            const typeSelect = document.getElementById('newAccountType');
            typeSelect.innerHTML = '<option value="">Select Type...</option>';
            typesData.account_types.forEach(type => {
                typeSelect.innerHTML += `<option value="${type.id}">${type.name} (${type.category})</option>`;
            });
        }
        
        // Load banks
        const banksResponse = await fetch('/api/wizard/banks');
        const banksData = await banksResponse.json();
        
        if (banksData.success) {
            const bankSelect = document.getElementById('newAccountBank');
            bankSelect.innerHTML = '<option value="">Select Bank (optional)...</option>';
            banksData.banks.forEach(bank => {
                bankSelect.innerHTML += `<option value="${bank.id}">${bank.name}</option>`;
            });
        }
    } catch (error) {
        showMessage('Failed to load options: ' + error.message, 'error');
    }
}

async function confirmAddAccount() {
    const name = document.getElementById('newAccountName').value;
    const typeId = document.getElementById('newAccountType').value;
    const bankId = document.getElementById('newAccountBank').value;
    const accountNumber = document.getElementById('newAccountNumber').value;

    if (!name || !typeId || !currentStoreId) {
        showMessage('Please fill in required fields', 'error');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch('/api/wizard/add-account', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                store_id: currentStoreId,
                account_name: name,
                account_type_id: parseInt(typeId),
                bank_id: bankId ? parseInt(bankId) : null,
                account_number: accountNumber || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Account added successfully', 'success');
            closeAddAccountModal();
            document.getElementById('newAccountName').value = '';
            document.getElementById('newAccountType').value = '';
            document.getElementById('newAccountBank').value = '';
            document.getElementById('newAccountNumber').value = '';
            
            // Reload accounts
            onStoreChange();
            if (currentSettingsSection === 'accounts') {
                loadAccountsSection();
            }
        } else {
            showMessage('Failed to add account: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Delete account
async function deleteAccount(accountId, accountName) {
    if (!confirm(`Delete "${accountName}"?`)) return;

    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/delete-account/${accountId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`Account deleted successfully`, 'success');
            await onStoreChange();
            if (currentSettingsSection === 'accounts') {
                loadAccountsSection();
            }
        } else {
            showMessage(`Failed to delete: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Move account functions
function showMoveOptions(accountId, accountName) {
    accountToMove = {id: accountId, name: accountName};
    document.getElementById('moveAccountName').value = accountName;
    document.getElementById('moveAccountModal').classList.add('active');

    // Populate category options
    const categorySelect = document.getElementById('moveCategorySelect');
    categorySelect.innerHTML = `
        <option value="">Select Category...</option>
        <option value="assets">Assets</option>
        <option value="liabilities">Liabilities</option>
    `;

    // Add change listener for category to populate subcategories
    categorySelect.onchange = function() {
        populateSubcategories(this.value);
    };
}

function populateSubcategories(category) {
    const subcategorySelect = document.getElementById('moveSubcategorySelect');

    if (category === 'assets') {
        subcategorySelect.innerHTML = `
            <option value="">Select Subcategory...</option>
            <option value="bank_accounts">Bank Accounts</option>
            <option value="merchant_accounts">Merchant Accounts</option>
            <option value="inventory">Inventory</option>
            <option value="receivables">Other Assets</option>
        `;
    } else if (category === 'liabilities') {
        subcategorySelect.innerHTML = `
            <option value="">Select Subcategory...</option>
            <option value="payables">Payables & Obligations</option>
        `;
    } else {
        subcategorySelect.innerHTML = '<option value="">Select Category First...</option>';
    }
}

function closeMoveModal() {
    document.getElementById('moveAccountModal').classList.remove('active');
    accountToMove = null;
}

// Add new function for adding accounts to groups
async function addAccountToGroup(groupType) {
    if (!currentStoreId) {
        showMessage('Please select a store first', 'error');
        return;
    }

    // Open the add account modal with pre-selected type based on group
    openAddAccountModal();

    // Pre-select account type based on group
    setTimeout(() => {
        const typeSelect = document.getElementById('newAccountType');
        if (groupType === 'bank') {
            for (let option of typeSelect.options) {
                if (option.text.includes('Bank')) {
                    option.selected = true;
                    break;
                }
            }
        } else if (groupType === 'merchant') {
            for (let option of typeSelect.options) {
                if (option.text.includes('Merchant')) {
                    option.selected = true;
                    break;
                }
            }
        } else if (groupType === 'inventory') {
            for (let option of typeSelect.options) {
                if (option.text.includes('Inventory')) {
                    option.selected = true;
                    break;
                }
            }
        } else if (groupType === 'payables') {
            for (let option of typeSelect.options) {
                if (option.text.includes('Payable') || option.text.includes('Credit')) {
                    option.selected = true;
                    break;
                }
            }
        }
    }, 100);
}

// Delete draft from settings
async function deleteDraftFromSettings(draftId) {
    if (!confirm('Delete this draft?')) return;

    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/draft/${draftId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Draft deleted successfully', 'success');
            loadDraftsSection();
        } else {
            showMessage('Failed to delete draft', 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Save draft
async function saveDraft() {
    if (!currentStoreId) {
        showMessage('Please select a store', 'error');
        return;
    }

    const snapshotDate = document.getElementById('snapshotDate').value;
    if (!snapshotDate) {
        showMessage('Please select a date', 'error');
        return;
    }

    const balances = collectBalances();

    showLoading(true);
    try {
        const response = await fetch('/api/wizard/save-draft', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                store_id: parseInt(currentStoreId),
                snapshot_date: snapshotDate,
                balances: balances,
                draft_id: currentDraftId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentDraftId = data.draft_id;
            currentDraftBalances = {};
            balances.forEach(b => {
                currentDraftBalances[b.account_id] = b.amount;
            });
            
            showMessage(`Draft saved! (${balances.length} balances)`, 'success');
        } else {
            showMessage('Failed to save draft: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Publish snapshot
async function publishSnapshot() {
    if (!currentStoreId) {
        showMessage('Please select a store', 'error');
        return;
    }

    const snapshotDate = document.getElementById('snapshotDate').value;
    if (!snapshotDate) {
        showMessage('Please select a date', 'error');
        return;
    }

    const balances = collectBalances();
    if (balances.length === 0) {
        showMessage('Please enter at least one balance', 'error');
        return;
    }

    if (!confirm('Publish this as final?')) {
        return;
    }

    showLoading(true);
    try {
        const response = await fetch('/api/wizard/save-snapshot', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                store_id: parseInt(currentStoreId),
                snapshot_date: snapshotDate,
                balances: balances,
                status: 'completed',
                draft_id: currentDraftId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Snapshot published successfully!', 'success');
            clearAll();
            currentDraftId = null;
            currentDraftBalances = {};
        } else {
            showMessage('Failed to publish: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Load previous snapshot
async function loadPreviousSnapshot() {
    if (!currentStoreId) {
        showMessage('Please select a store first', 'error');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/latest-snapshot/${currentStoreId}`);
        const data = await response.json();
        
        if (data.success && data.has_previous) {
            for (const [accountId, balance] of Object.entries(data.balances)) {
                const input = document.querySelector(`input[data-account-id="${accountId}"]`);
                if (input) {
                    input.value = Math.abs(balance);
                    input.classList.add('has-value');
                }
            }
            updateSummary();
            showMessage(`Loaded snapshot from ${data.snapshot_date}`, 'success');
        } else {
            showMessage('No previous snapshot found', 'error');
        }
    } catch (error) {
        showMessage('Failed to load previous snapshot', 'error');
    } finally {
        showLoading(false);
    }
}

// Load drafts
async function loadDrafts() {
    showLoading(true);
    try {
        const response = await fetch('/api/wizard/drafts');
        const data = await response.json();
        
        if (data.success && data.drafts.length > 0) {
            // Switch to settings tab and show drafts
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.getElementById('settingsTab').classList.add('active');
            
            document.querySelectorAll('.tab').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab')[2].classList.add('active');
            
            loadDraftsSection();
        } else {
            showMessage('No drafts found', 'info');
        }
    } catch (error) {
        showMessage('Failed to load drafts', 'error');
    } finally {
        showLoading(false);
    }
}

// Load specific draft
async function loadSpecificDraft(draftId) {
    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/draft/${draftId}`);
        const data = await response.json();
        
        if (data.success) {
            currentDraftId = draftId;
            
            // Switch back to entry tab
            switchToEntryTab();
            
            // Set store and date
            document.getElementById('storeSelect').value = data.draft.store_id;
            document.getElementById('snapshotDate').value = data.draft.snapshot_date;
            
            // Store balances globally
            currentDraftBalances = {};
            if (data.draft.balances && data.draft.balances.length > 0) {
                data.draft.balances.forEach(balance => {
                    currentDraftBalances[balance.account_id] = balance.amount;
                });
            }
            
            // Load accounts
            await onStoreChange();
            
            showMessage(`Loaded draft with ${data.draft.balance_count} balances`, 'success');
        }
    } catch (error) {
        showMessage('Failed to load draft', 'error');
    } finally {
        showLoading(false);
    }
}

// Switch to entry tab
function switchToEntryTab() {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById('entryTab').classList.add('active');

    document.querySelectorAll('.tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab')[1].classList.add('active');
}

// Clear all inputs
function clearAll() {
    if (!confirm('Clear all entered values?')) return;

    document.querySelectorAll('.account-input').forEach(input => {
        input.value = '';
        input.classList.remove('has-value');
    });
    updateSummary();
}

// Clear account sections
function clearAccountSections() {
    ['bankAccounts', 'merchantAccounts', 'inventory', 'receivables', 'liabilities'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '';
        }
    });
}

// Restore draft values
function restoreDraftValues() {
    if (!currentDraftBalances || Object.keys(currentDraftBalances).length === 0) {
        return;
    }

    for (const [accountId, value] of Object.entries(currentDraftBalances)) {
        const input = document.querySelector(`input[data-account-id="${accountId}"]`);
        if (input) {
            input.value = Math.abs(value);
            input.classList.add('has-value');
        }
    }

    updateSummary();
}

// Toggle summary section collapse/expand
function toggleSummarySection(sectionId) {
    const section = document.getElementById(sectionId);
    const toggleIcon = document.getElementById(sectionId + 'Toggle');

    if (section) {
        section.classList.toggle('collapsed');
        if (toggleIcon) {
            toggleIcon.classList.toggle('collapsed');
        }
    }
}

// Update summary calculations with detailed breakdown
function updateSummary() {
    let totalAssets = 0;
    let totalLiabilities = 0;

    // Objects to store account details by category
    const accountDetails = {
        bankAccounts: [],
        merchantAccounts: [],
        inventory: [],
        otherAssets: [],
        liabilities: []
    };

    // Collect all account values
    document.querySelectorAll('.account-input').forEach(input => {
        const value = parseFloat(input.value) || 0;
        const accountId = input.dataset.accountId;
        const category = input.dataset.category;
        
        // Get the account label
        const accountRow = input.closest('.account-row');
        const accountLabel = accountRow ? accountRow.querySelector('.account-label')?.textContent : 'Unknown Account';
        
        if (value !== 0) {
            const accountInfo = {
                id: accountId,
                label: accountLabel,
                value: Math.abs(value),
                category: category
            };
            
            // Categorize the account
            const parentId = input.closest('[id]')?.id;
            
            if (category === 'Asset') {
                totalAssets += Math.abs(value);
                
                if (parentId === 'bankAccounts') {
                    accountDetails.bankAccounts.push(accountInfo);
                } else if (parentId === 'merchantAccounts') {
                    accountDetails.merchantAccounts.push(accountInfo);
                } else if (parentId === 'inventory') {
                    accountDetails.inventory.push(accountInfo);
                } else if (parentId === 'receivables') {
                    accountDetails.otherAssets.push(accountInfo);
                }
            } else if (category === 'Liability') {
                totalLiabilities += Math.abs(value);
                accountDetails.liabilities.push(accountInfo);
            }
        }
    });

    // Update main totals
    const totalAssetsEl = document.getElementById('totalAssets');
    const totalLiabilitiesEl = document.getElementById('totalLiabilities');
    const netPositionEl = document.getElementById('netPosition');
    const assetTotalEl = document.getElementById('assetTotal');
    const liabilityTotalEl = document.getElementById('liabilityTotal');

    if (totalAssetsEl) totalAssetsEl.textContent = formatCurrency(totalAssets);
    if (totalLiabilitiesEl) totalLiabilitiesEl.textContent = formatCurrency(totalLiabilities);
    if (netPositionEl) {
        const netPosition = totalAssets - totalLiabilities;
        netPositionEl.textContent = formatCurrency(netPosition);
        
        // Update color based on positive/negative
        if (netPosition > 0) {
            netPositionEl.style.color = '#27ae60';
        } else if (netPosition < 0) {
            netPositionEl.style.color = '#e74c3c';
        } else {
            netPositionEl.style.color = '#2c3e50';
        }
    }
    if (assetTotalEl) assetTotalEl.textContent = formatCurrency(totalAssets);
    if (liabilityTotalEl) liabilityTotalEl.textContent = formatCurrency(totalLiabilities);

    // Update detailed breakdowns if they exist
    updateSummarySection('summaryBankAccounts', accountDetails.bankAccounts);
    updateSummarySection('summaryMerchantAccounts', accountDetails.merchantAccounts);
    updateSummarySection('summaryInventory', accountDetails.inventory);
    updateSummarySection('summaryOtherAssets', accountDetails.otherAssets);
    updateSummarySection('summaryLiabilities', accountDetails.liabilities);
}

// Update individual summary section
function updateSummarySection(containerId, accounts) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (accounts.length === 0) {
        container.innerHTML = '<div class="summary-empty">No entries</div>';
        return;
    }

    let html = '';
    let subtotal = 0;

    accounts.forEach(account => {
        const valueClass = account.value > 0 ? 'positive' : account.value < 0 ? 'negative' : 'zero';
        html += `
            <div class="summary-item">
                <span class="summary-item-label" title="${account.label}">${account.label}</span>
                <span class="summary-item-value ${valueClass}">${formatCurrency(account.value)}</span>
            </div>
        `;
        subtotal += account.value;
    });

    container.innerHTML = html;
}

// Collect balances from form
function collectBalances() {
    const balances = [];
    document.querySelectorAll('.account-input').forEach(input => {
        const value = parseFloat(input.value) || 0;
        if (value !== 0) {
            balances.push({
                account_id: parseInt(input.dataset.accountId),
                amount: input.dataset.category === 'Liability' ? -Math.abs(value) : Math.abs(value)
            });
        }
    });
    return balances;
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
}

function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        loadingEl.classList.toggle('active', show);
    }
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    if (messageEl) {
        messageEl.textContent = text;
        messageEl.className = `message ${type} active`;
        setTimeout(() => {
            messageEl.classList.remove('active');
        }, 5000);
    }
}

// ========== REPORTS TAB FUNCTIONS ==========

// Initialize Reports Tab
function initializeReportsTab() {
    // Populate store dropdown
    const reportStoreSelect = document.getElementById('reportStoreSelect');
    if (reportStoreSelect && allStores) {
        reportStoreSelect.innerHTML = '<option value="">Select Store...</option>';
        allStores.forEach(store => {
            const option = document.createElement('option');
            option.value = store.id;
            option.textContent = `${store.name} (${store.code})`;
            reportStoreSelect.appendChild(option);
        });
    }
}

// Load snapshots for selected store
async function loadReportSnapshots() {
    const storeId = document.getElementById('reportStoreSelect').value;
    const typeFilter = document.getElementById('reportTypeFilter').value;
    
    if (!storeId) {
        document.getElementById('reportSnapshotSelect').innerHTML = '<option value="">Select Store First...</option>';
        document.getElementById('compareSnapshotSelect').innerHTML = '<option value="">Select Store First...</option>';
        return;
    }
    
    showLoading(true);
    try {
        // Get all snapshots for the store
        const response = await fetch(`/api/wizard/store-snapshots/${storeId}?type=${typeFilter}`);
        const data = await response.json();
        
        if (data.success) {
            const snapshotSelect = document.getElementById('reportSnapshotSelect');
            const compareSelect = document.getElementById('compareSnapshotSelect');
            
            snapshotSelect.innerHTML = '<option value="">Select Snapshot...</option>';
            compareSelect.innerHTML = '<option value="">Select Snapshot to Compare...</option>';
            
            data.snapshots.forEach(snapshot => {
                const status = snapshot.status === 'draft' ? ' [DRAFT]' : ' [PUBLISHED]';
                const optionText = `${snapshot.snapshot_date}${status} - Net: ${formatCurrency(snapshot.net_position)}`;
                
                const option = document.createElement('option');
                option.value = snapshot.id;
                option.textContent = optionText;
                option.dataset.snapshot = JSON.stringify(snapshot);
                snapshotSelect.appendChild(option);
                
                const compareOption = option.cloneNode(true);
                compareSelect.appendChild(compareOption);
            });
        }
    } catch (error) {
        showMessage('Failed to load snapshots: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Load and display balance sheet
async function loadBalanceSheet() {
    const snapshotId = document.getElementById('reportSnapshotSelect').value;
    
    if (!snapshotId) {
        document.getElementById('balanceSheetDisplay').innerHTML = `
            <div class="balance-sheet-placeholder">
                <p>Select a store and snapshot to view the balance sheet</p>
            </div>
        `;
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/balance-sheet/${snapshotId}`);
        const data = await response.json();
        
        if (data.success) {
            currentSnapshot = data.balance_sheet;
            displayBalanceSheet(currentSnapshot, comparisonMode ? compareSnapshot : null);
        } else {
            showMessage('Failed to load balance sheet: ' + data.error, 'error');
        }
    } catch (error) {
        showMessage('Failed to load balance sheet: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Display the balance sheet
function displayBalanceSheet(snapshot, compareWith = null) {
    const container = document.getElementById('balanceSheetDisplay');
    
    if (compareWith) {
        container.innerHTML = generateComparisonView(snapshot, compareWith);
    } else {
        container.innerHTML = generateSingleBalanceSheet(snapshot);
    }
}

// Generate single balance sheet HTML
function generateSingleBalanceSheet(data) {
    const statusClass = data.status === 'draft' ? 'status-draft' : 'status-published';
    const statusText = data.status === 'draft' ? 'DRAFT' : 'PUBLISHED';
    
    let html = `
        <div class="balance-sheet">
            <div class="balance-sheet-header">
                <div class="company-name">${data.store_name}</div>
                <div class="statement-title">BALANCE SHEET</div>
                <div class="statement-date">
                    As of ${formatDate(data.snapshot_date)}
                    <span class="statement-status ${statusClass}">${statusText}</span>
                </div>
            </div>
            
            <div class="balance-sheet-section">
                <h3 class="section-title">ASSETS</h3>
                
                <div class="subsection">
                    <h4 class="subsection-title">Current Assets</h4>
                    ${generateAccountLines(data.assets.bank_accounts, 'Bank Accounts')}
                    ${generateAccountLines(data.assets.merchant_accounts, 'Merchant Accounts')}
                    ${generateAccountLines(data.assets.inventory, 'Inventory')}
                    <div class="subtotal-line">
                        <span class="subtotal-label">Total Current Assets</span>
                        <span class="subtotal-value">${formatCurrency(data.assets.current_total)}</span>
                    </div>
                </div>
                
                ${data.assets.other_assets && data.assets.other_assets.length > 0 ? `
                <div class="subsection">
                    <h4 class="subsection-title">Other Assets</h4>
                    ${generateAccountLines(data.assets.other_assets)}
                    <div class="subtotal-line">
                        <span class="subtotal-label">Total Other Assets</span>
                        <span class="subtotal-value">${formatCurrency(data.assets.other_total)}</span>
                    </div>
                </div>
                ` : ''}
                
                <div class="total-line total-assets">
                    <span>TOTAL ASSETS</span>
                    <span>${formatCurrency(data.total_assets)}</span>
                </div>
            </div>
            
            <div class="balance-sheet-section">
                <h3 class="section-title">LIABILITIES</h3>
                
                <div class="subsection">
                    <h4 class="subsection-title">Current Liabilities</h4>
                    ${generateAccountLines(data.liabilities.current_liabilities)}
                    <div class="subtotal-line">
                        <span class="subtotal-label">Total Current Liabilities</span>
                        <span class="subtotal-value">${formatCurrency(data.liabilities.current_total)}</span>
                    </div>
                </div>
                
                ${data.liabilities.long_term && data.liabilities.long_term.length > 0 ? `
                <div class="subsection">
                    <h4 class="subsection-title">Long-term Liabilities</h4>
                    ${generateAccountLines(data.liabilities.long_term)}
                    <div class="subtotal-line">
                        <span class="subtotal-label">Total Long-term Liabilities</span>
                        <span class="subtotal-value">${formatCurrency(data.liabilities.long_term_total)}</span>
                    </div>
                </div>
                ` : ''}
                
                <div class="total-line total-liabilities">
                    <span>TOTAL LIABILITIES</span>
                    <span>${formatCurrency(data.total_liabilities)}</span>
                </div>
            </div>
            
            <div class="total-section">
                <div class="net-position-line">
                    <span>NET POSITION (EQUITY)</span>
                    <span>${formatCurrency(data.net_position)}</span>
                </div>
            </div>
            
            ${data.ytd_sales || data.ytd_profit ? `
            <div class="balance-sheet-section">
                <h3 class="section-title">YEAR-TO-DATE PERFORMANCE</h3>
                <div class="subsection">
                    ${data.ytd_sales ? `
                    <div class="account-line">
                        <span class="account-name">YTD Sales</span>
                        <span class="account-value">${formatCurrency(data.ytd_sales)}</span>
                    </div>
                    ` : ''}
                    ${data.ytd_profit ? `
                    <div class="account-line">
                        <span class="account-name">YTD Profit</span>
                        <span class="account-value">${formatCurrency(data.ytd_profit)}</span>
                    </div>
                    ` : ''}
                    ${data.profit_margin ? `
                    <div class="account-line">
                        <span class="account-name">Profit Margin</span>
                        <span class="account-value">${data.profit_margin.toFixed(2)}%</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; text-align: center; color: #6c757d; font-size: 12px;">
                Generated on ${new Date().toLocaleString()} | 
                ${data.created_by ? `Prepared by: ${data.created_by} | ` : ''}
                Snapshot ID: ${data.id}
            </div>
        </div>
    `;
    
    return html;
}

// Generate account lines HTML
function generateAccountLines(accounts, label = null) {
    if (!accounts || accounts.length === 0) return '';
    
    let html = '';
    if (label) {
        html += `<div style="font-weight: 600; color: #6c757d; font-size: 13px; margin: 10px 0 5px 40px;">${label}</div>`;
    }
    
    accounts.forEach(account => {
        html += `
            <div class="account-line">
                <span class="account-name">${account.account_name}</span>
                <span class="account-value">${formatCurrency(Math.abs(account.balance))}</span>
            </div>
        `;
    });
    
    return html;
}

// Generate comparison view
function generateComparisonView(snapshot1, snapshot2) {
    let html = `
        <div class="balance-sheet-comparison">
            <div class="comparison-column">
                <div class="comparison-header">
                    <div class="comparison-label">Primary Snapshot</div>
                    <div class="comparison-date">${formatDate(snapshot1.snapshot_date)}</div>
                    <div class="statement-status ${snapshot1.status === 'draft' ? 'status-draft' : 'status-published'}">
                        ${snapshot1.status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
                    </div>
                </div>
                ${generateComparisonContent(snapshot1, snapshot2, false)}
            </div>
            
            <div class="comparison-column">
                <div class="comparison-header">
                    <div class="comparison-label">Comparison Snapshot</div>
                    <div class="comparison-date">${formatDate(snapshot2.snapshot_date)}</div>
                    <div class="statement-status ${snapshot2.status === 'draft' ? 'status-draft' : 'status-published'}">
                        ${snapshot2.status === 'draft' ? 'DRAFT' : 'PUBLISHED'}
                    </div>
                </div>
                ${generateComparisonContent(snapshot2, snapshot1, true)}
            </div>
        </div>
    `;
    
    return html;
}

// Generate comparison content
function generateComparisonContent(primary, compare, isSecondColumn) {
    // This would generate the comparison content with differences highlighted
    // For brevity, returning simplified version
    return generateSingleBalanceSheet(primary).replace('balance-sheet', 'comparison-sheet');
}

// Toggle comparison mode
function toggleComparison() {
    comparisonMode = !comparisonMode;
    const comparisonControls = document.getElementById('comparisonControls');
    const toggleText = document.getElementById('compareToggleText');
    
    if (comparisonMode) {
        comparisonControls.style.display = 'block';
        toggleText.textContent = 'Disable Comparison';
    } else {
        comparisonControls.style.display = 'none';
        toggleText.textContent = 'Enable Comparison';
        compareSnapshot = null;
        if (currentSnapshot) {
            displayBalanceSheet(currentSnapshot);
        }
    }
}

// Load comparison
async function loadComparison() {
    const compareId = document.getElementById('compareSnapshotSelect').value;
    
    if (!compareId) {
        compareSnapshot = null;
        if (currentSnapshot) {
            displayBalanceSheet(currentSnapshot);
        }
        return;
    }
    
    showLoading(true);
    try {
        const response = await fetch(`/api/wizard/balance-sheet/${compareId}`);
        const data = await response.json();
        
        if (data.success) {
            compareSnapshot = data.balance_sheet;
            if (currentSnapshot) {
                displayBalanceSheet(currentSnapshot, compareSnapshot);
            }
        }
    } catch (error) {
        showMessage('Failed to load comparison snapshot: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Export balance sheet as PDF
function exportBalanceSheet() {
    if (!currentSnapshot) {
        showMessage('Please select a snapshot first', 'error');
        return;
    }
    
    // This would typically use a library like jsPDF or html2pdf
    // For now, just trigger print
    window.print();
    showMessage('Use your browser\'s print dialog to save as PDF', 'info');
}

// Print balance sheet
function printBalanceSheet() {
    if (!currentSnapshot) {
        showMessage('Please select a snapshot first', 'error');
        return;
    }
    
    window.print();
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
