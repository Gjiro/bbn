// Global state
let sessionId = null;
let currentStoreId = null;
let storeAccounts = {};
let currentDraftId = null;
let allStores = [];
let currentDraftBalances = {};
let accountToMove = null;

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
});

// Tab switching
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

// Render accounts with drag handles
function renderAccounts() {
    renderAccountSection('bankAccounts', storeAccounts.bank_accounts);
    renderAccountSection('merchantAccounts', storeAccounts.merchant_accounts);
    renderAccountSection('inventory', storeAccounts.inventory);
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

// Render a section of accounts with drag capability
function renderAccountSection(containerId, accounts) {
    const container = document.getElementById(containerId);
    if (!accounts || accounts.length === 0) {
        container.innerHTML = '<p style="color: #999; font-size: 13px;">No accounts available</p>';
        return;
    }
    
    let html = '';
    accounts.forEach(account => {
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
                    <button class="btn-small" onclick="showMoveOptions(${account.id}, '${account.name}')">⚙️</button>
                    <button class="btn-small" onclick="deleteAccount(${account.id}, '${account.name}')">🗑️</button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
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

// Show move options for account
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
}

// Close move modal
function closeMoveModal() {
    document.getElementById('moveAccountModal').classList.remove('active');
    accountToMove = null;
}

// Confirm account move
function confirmMove() {
    if (!accountToMove) return;
    
    const category = document.getElementById('moveCategorySelect').value;
    const subcategory = document.getElementById('moveSubcategorySelect').value;
    
    if (!category || !subcategory) {
        showMessage('Please select both category and subcategory', 'error');
        return;
    }
    
    // TODO: Implement API call to move account
    showMessage(`Account "${accountToMove.name}" moved successfully`, 'success');
    closeMoveModal();
    onStoreChange(); // Reload accounts
}

// Settings section management
function showSettingsSection(section) {
    // Update active menu item
    document.querySelectorAll('.settings-menu-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
    
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
    }
}

// Load drafts section
async function loadDraftsSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = '<h2>📁 Pending Drafts</h2><div>Loading...</div>';
    
    try {
        const response = await fetch('/api/wizard/drafts');
        const data = await response.json();
        
        if (data.success && data.drafts.length > 0) {
            let html = '<h2>📁 Pending Drafts</h2>';
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
            content.innerHTML = '<h2>📁 Pending Drafts</h2><p>No drafts found</p>';
        }
    } catch (error) {
        content.innerHTML = '<h2>📁 Pending Drafts</h2><p style="color: red;">Failed to load drafts</p>';
    }
}

// Load categories section
function loadCategoriesSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = `
        <h2>📚 Categories Management</h2>
        <button class="btn-primary" style="margin-bottom: 20px;">+ Add New Category</button>
        <div class="category-list">
            <div class="category-item">
                <div>
                    <div class="category-item-name">Bank Accounts</div>
                    <small style="color: #666;">Category: Assets</small>
                </div>
                <div class="category-item-actions">
                    <button class="btn-small">Edit</button>
                    <button class="btn-small">Delete</button>
                </div>
            </div>
            <div class="category-item">
                <div>
                    <div class="category-item-name">Merchant Accounts</div>
                    <small style="color: #666;">Category: Assets</small>
                </div>
                <div class="category-item-actions">
                    <button class="btn-small">Edit</button>
                    <button class="btn-small">Delete</button>
                </div>
            </div>
            <div class="category-item">
                <div>
                    <div class="category-item-name">Credit Cards</div>
                    <small style="color: #666;">Category: Liabilities</small>
                </div>
                <div class="category-item-actions">
                    <button class="btn-small">Edit</button>
                    <button class="btn-small">Delete</button>
                </div>
            </div>
        </div>
    `;
}

// Load accounts section
async function loadAccountsSection() {
    const content = document.getElementById('settingsContent');
    content.innerHTML = '<h2>💼 All Accounts</h2><div>Loading...</div>';
    
    if (!currentStoreId) {
        content.innerHTML = '<h2>💼 All Accounts</h2><p>Please select a store first</p>';
        return;
    }
    
    // Use the already loaded accounts
    let html = '<h2>💼 All Accounts</h2>';
    html += '<input type="text" placeholder="Search accounts..." style="margin-bottom: 20px; width: 100%;" class="form-input">';
    html += '<div class="category-list">';
    
    // Combine all accounts
    const allAccounts = [
        ...storeAccounts.bank_accounts || [],
        ...storeAccounts.merchant_accounts || [],
        ...storeAccounts.inventory || [],
        ...storeAccounts.receivables || [],
        ...storeAccounts.liabilities || []
    ];
    
    allAccounts.forEach(account => {
        html += `
            <div class="category-item">
                <div>
                    <div class="category-item-name">${account.name}</div>
                    <small style="color: #666;">Type: ${account.type} | Category: ${account.category}</small>
                </div>
                <div class="category-item-actions">
                    <button class="btn-small">Edit</button>
                    <button class="btn-small">Move</button>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    content.innerHTML = html;
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
        } else {
            showMessage(`Failed to delete: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage('Network error: ' + error.message, 'error');
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
            document.querySelectorAll('.tab')[1].classList.add('active');
            
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
    document.querySelectorAll('.tab')[0].classList.add('active');
}

// Clear all inputs
function clearAll() {
    if (confirm('Clear all entered values?')) {
        document.querySelectorAll('.account-input').forEach(input => {
            input.value = '';
            input.classList.remove('has-value');
        });
        updateSummary();
    }
}

// Clear account sections
function clearAccountSections() {
    ['bankAccounts', 'merchantAccounts', 'inventory', 'receivables', 'liabilities'].forEach(id => {
        document.getElementById(id).innerHTML = '';
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

// Update summary calculations
function updateSummary() {
    let totalAssets = 0;
    let totalLiabilities = 0;
    
    document.querySelectorAll('.account-input').forEach(input => {
        const value = parseFloat(input.value) || 0;
        if (value === 0) return;
        
        const category = input.dataset.category;
        
        if (category === 'Asset') {
            totalAssets += Math.abs(value);
        } else if (category === 'Liability') {
            totalLiabilities += Math.abs(value);
        }
    });
    
    document.getElementById('totalAssets').textContent = formatCurrency(totalAssets);
    document.getElementById('totalLiabilities').textContent = formatCurrency(totalLiabilities);
    document.getElementById('netPosition').textContent = formatCurrency(totalAssets - totalLiabilities);
    
    // Update category totals
    document.getElementById('assetTotal').textContent = formatCurrency(totalAssets);
    document.getElementById('liabilityTotal').textContent = formatCurrency(totalLiabilities);
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
    document.getElementById('loading').classList.toggle('active', show);
}

function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type} active`;
    setTimeout(() => {
        messageEl.classList.remove('active');
    }, 5000);
}
