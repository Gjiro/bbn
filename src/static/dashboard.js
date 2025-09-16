// Elite Era Balance Sheet Dashboard - JavaScript Controller

class BalanceSheetDashboard {
    constructor() {
        this.apiBase = '/api';
        this.currentStep = 1;
        this.wizardData = {};
        this.stores = [];
        this.accounts = []; // Store all accounts for easy lookup
        this.snapshots = [];
        this.chart = null;
        
        this.init();
    }

    async init() {
        try {
            await this.loadStoresAndAccounts();
            await this.loadDashboardData();
            this.setupEventListeners();
            this.initializeChart();
            this.setCurrentDate();
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.showError('Failed to initialize dashboard: ' + (error.message || error));
        }
    }

    // ===== API METHODS =====
    
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API call failed: ${endpoint}`, error);
            throw error;
        }
    }

    async loadStoresAndAccounts() {
        try {
            const storesResponse = await this.apiCall('/stores');
            this.stores = storesResponse.stores || [];
            this.populateStoreSelectors();

            const accountsResponse = await this.apiCall('/accounts'); // Load all accounts once
            this.accounts = accountsResponse.accounts || [];
            console.log("Loaded accounts:", this.accounts); // DEBUG

        } catch (error) {
            console.error('Failed to load stores or accounts:', error);
            this.stores = [];
            this.accounts = [];
            throw error; // Re-throw to be caught by init()
        }
    }

    async loadDashboardData() {
        try {
            this.showLoading(true);
            
            // Load dashboard summary
            const summaryResponse = await this.apiCall('/dashboard/summary');
            this.updateKPIs(summaryResponse.summary);
            this.updateStoreBreakdown(summaryResponse.stores);
            
            // Load timeline data
            const timelineResponse = await this.apiCall('/dashboard/timeline?days=30');
            this.updateChart(timelineResponse.timeline);
            
            // Load snapshots
            const snapshotsResponse = await this.apiCall('/snapshots?limit=20');
            this.snapshots = snapshotsResponse.snapshots || [];
            this.updateSnapshotsTable();
            
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showError('Failed to load dashboard data');
            throw error; // Re-throw to be caught by init()
        } finally {
            this.showLoading(false);
        }
    }

    // ===== UI UPDATE METHODS =====
    
    updateKPIs(summary) {
        if (!summary) return;
        
        const elements = {
            totalNetPosition: summary.net_position || 0,
            totalAssets: summary.total_assets || 0,
            totalLiabilities: summary.total_liabilities || 0,
            ytdProfit: summary.ytd_profit || 0
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = this.formatCurrency(value);
                element.classList.add('neon-value-updated');
                setTimeout(() => element.classList.remove('neon-value-updated'), 600);
            }
        });
        
        // Update change percentages (mock data for now)
        this.updateChangeIndicator('netPositionChange', 5.2);
        this.updateChangeIndicator('assetsChange', 3.8);
        this.updateChangeIndicator('liabilitiesChange', -2.1);
        this.updateChangeIndicator('profitChange', 12.5);
    }
    
    updateChangeIndicator(id, percentage) {
        const element = document.getElementById(id);
        if (element) {
            const isPositive = percentage >= 0;
            element.textContent = `${isPositive ? '+' : ''}${percentage.toFixed(1)}%`;
            element.parentElement.className = `kpi-change ${isPositive ? 'positive' : 'negative'}`;
        }
    }
    
    updateStoreBreakdown(stores) {
        const container = document.getElementById('storesGrid');
        if (!container || !stores) return;
        
        container.innerHTML = stores.map(store => `
            <div class="neon-card store-card neon-fade-in">
                <div class="store-header">
                    <div>
                        <div class="store-name">${store.store_name}</div>
                        <div class="store-type">${store.store_code}</div>
                    </div>
                    <i class="fas fa-store neon-icon"></i>
                </div>
                <div class="store-metrics">
                    <div class="store-metric">
                        <div class="store-metric-label">Net Position</div>
                        <div class="store-metric-value">${this.formatCurrency(store.net_position)}</div>
                    </div>
                    <div class="store-metric">
                        <div class="store-metric-label">Assets</div>
                        <div class="store-metric-value">${this.formatCurrency(store.total_assets)}</div>
                    </div>
                    <div class="store-metric">
                        <div class="store-metric-label">YTD Sales</div>
                        <div class="store-metric-value">${this.formatCurrency(store.ytd_sales)}</div>
                    </div>
                    <div class="store-metric">
                        <div class="store-metric-label">YTD Profit</div>
                        <div class="store-metric-value">${this.formatCurrency(store.ytd_profit)}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    updateSnapshotsTable(snapshotsToDisplay = this.snapshots) {
        const tbody = document.getElementById('snapshotsTableBody');
        if (!tbody) return;
        
        if (snapshotsToDisplay.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                        No snapshots available. Create your first snapshot using the wizard.
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = snapshotsToDisplay.map(snapshot => `
            <tr>
                <td>${this.formatDate(snapshot.snapshot_date)}</td>
                <td>${snapshot.store?.name || 'Unknown'}</td>
                <td class="${snapshot.net_position >= 0 ? 'positive' : 'negative'}">
                    ${this.formatCurrency(snapshot.net_position)}
                </td>
                <td>${this.formatCurrency(snapshot.total_assets)}</td>
                <td>${this.formatCurrency(snapshot.total_liabilities)}</td>
                <td>${this.formatCurrency(snapshot.ytd_sales)}</td>
                <td>${this.formatCurrency(snapshot.ytd_profit)}</td>
                <td>
                    <button class="neon-btn neon-btn-secondary" onclick="window.dashboard.viewSnapshot(${snapshot.id})" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    // ===== CHART METHODS =====
    
    initializeChart() {
        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;
        
        // Destroy existing chart instance if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Net Position',
                        data: [],
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Total Assets',
                        data: [],
                        borderColor: '#00ff41',
                        backgroundColor: 'rgba(0, 255, 65, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#b0b0b0',
                            font: {
                                family: 'Courier New'
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#b0b0b0',
                            font: {
                                family: 'Courier New'
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#b0b0b0',
                            font: {
                                family: 'Courier New'
                            },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }
    
    updateChart(timelineData) {
        if (!this.chart || !timelineData) return;
        
        const labels = timelineData.map(item => this.formatDate(item.date));
        const netPositionData = timelineData.map(item => item.net_position);
        const assetsData = timelineData.map(item => item.total_assets);
        
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = netPositionData;
        this.chart.data.datasets[1].data = assetsData;
        this.chart.update();
    }
    
    // ===== WIZARD METHODS =====
    
    populateStoreSelectors() {
        const selectors = ['wizardStore', 'storeFilter'];
        
        selectors.forEach(selectorId => {
            const select = document.getElementById(selectorId);
            if (!select) return;
            
            // Clear existing options (except first one for wizardStore)
            if (selectorId === 'storeFilter') {
                select.innerHTML = '<option value="">ALL STORES</option>';
            } else if (selectorId === 'wizardStore') {
                select.innerHTML = '<option value="">Choose a store...</option>';
            }
            
            this.stores.forEach(store => {
                const option = document.createElement('option');
                option.value = store.id;
                option.textContent = `${store.name} (${store.code})`;
                select.appendChild(option);
            });
        });
    }
    
    openWizard() {
        document.getElementById('wizardModal').style.display = 'flex';
        this.currentStep = 1;
        this.wizardData = {};
        this.updateWizardStep();
        this.setCurrentDate(); // Set current date for wizard
    }
    
    closeWizard() {
        document.getElementById('wizardModal').style.display = 'none';
        this.currentStep = 1;
        this.wizardData = {};
        this.clearWizardSteps(); // Clear dynamically added steps
    }

    clearWizardSteps() {
        // Remove dynamically added steps (step2, step3, step4, step5)
        const stepsToRemove = ['step2', 'step3', 'step4', 'step5'];
        stepsToRemove.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.remove();
        });
    }
    
    nextStep() {
        if (this.validateCurrentStep()) {
            this.saveCurrentStepData();
            if (this.currentStep < 5) {
                this.currentStep++;
                this.updateWizardStep();
            } else {
                this.completeWizard();
            }
        }
    }
    
    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateWizardStep();
        }
    }
    
    updateWizardStep() {
        // Update step indicators
        document.querySelectorAll('.step').forEach((step, index) => {
            step.classList.toggle('active', index + 1 === this.currentStep);
        });
        
        // Hide all wizard steps first
        document.querySelectorAll('.wizard-step').forEach(step => {
            step.classList.remove('active');
        });

        // Update buttons
        document.getElementById('prevBtn').disabled = this.currentStep === 1;
        document.getElementById('nextBtn').textContent = this.currentStep === 5 ? 'COMPLETE' : 'NEXT';
        
        // Load step-specific content
        this.loadStepContent();
    }
    
    async loadStepContent() {
        const wizardContentDiv = document.getElementById('wizardContent');
        if (!wizardContentDiv) return;

        // Ensure step1 is always present and active for step 1
        const step1Div = document.getElementById('step1');
        if (this.currentStep === 1) {
            step1Div.classList.add('active');
        } else {
            step1Div.classList.remove('active');
        }

        switch (this.currentStep) {
            case 1:
                // Content already in HTML
                break;
            case 2:
                await this.loadBankBalancesStep();
                break;
            case 3:
                await this.loadInventoryStep();
                break;
            case 4:
                await this.loadLiabilitiesStep();
                break;
            case 5:
                await this.loadReviewStep();
                break;
        }
    }
    
    async loadBankBalancesStep() {
        const storeId = this.wizardData.store_id;
        if (!storeId) {
            this.showError("Please select a store first.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
            return;
        }

        try {
            console.log("Loading bank balances for storeId:", storeId); // DEBUG
            console.log("All accounts available:", this.accounts); // DEBUG

            // Filter accounts for the selected store and relevant types
            const storeAccounts = this.accounts.filter(acc => {
                const isRelevantType = (
                    acc.account_type.category === 'Asset' ||
                    acc.account_type.category === 'Liability'
                ) && (
                    acc.account_type.name.includes('Checking') ||
                    acc.account_type.name.includes('Savings') ||
                    acc.account_type.name.includes('Credit Card') ||
                    acc.account_type.name.includes('Loan') ||
                    acc.account_type.name.includes('Points') || // Added Points account type
                    acc.account_type.name.includes('Amazon Seller Central') // Added Amazon Seller Central
                );
                return acc.store_id == storeId && isRelevantType;
            });

            console.log("Filtered store accounts for bank balances:", storeAccounts); // DEBUG

            let bankAccountsHtml = {};
            if (storeAccounts.length === 0) {
                bankAccountsHtml["No Accounts"] = `<h4>NO RELEVANT ACCOUNTS FOUND FOR THIS STORE</h4>`;
            } else {
                storeAccounts.forEach(account => {
                    const bankName = account.bank ? account.bank.name : 'Other';
                    if (!bankAccountsHtml[bankName]) {
                        bankAccountsHtml[bankName] = `<h4>${bankName.toUpperCase()} ACCOUNTS</h4>`;
                    }
                    const savedBalance = this.wizardData.bankBalances?.[account.id] !== undefined ? this.wizardData.bankBalances[account.id] : '';
                    bankAccountsHtml[bankName] += `
                        <div class="account-input">
                            <label>${account.account_name} (${account.account_number ? '...' + String(account.account_number).slice(-4) : 'N/A'}):</label>
                            <input type="number" class="neon-input" data-account-id="${account.id}" data-account-type-category="${account.account_type.category}" placeholder="0.00" step="0.01" value="${savedBalance}">
                        </div>
                    `;
                });
            }

            let stepContent = `
                <div class="wizard-step active" id="step2">
                    <h3>BANK BALANCES</h3>
                    <div class="bank-accounts-grid">
            `;

            for (const bankName in bankAccountsHtml) {
                stepContent += `<div class="account-group">${bankAccountsHtml[bankName]}</div>`;
            }

            stepContent += `
                    </div>
                </div>
            `;
            
            const existingStep2 = document.getElementById('step2');
            if (existingStep2) {
                existingStep2.remove();
            }
            document.getElementById("wizardContent").insertAdjacentHTML("beforeend", stepContent);

        } catch (error) {
            console.error("Failed to load bank accounts for wizard:", error);
            this.showError("Failed to load bank accounts. Please try again.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
        }
    }
    
    async loadInventoryStep() {
        const storeId = this.wizardData.store_id;
        if (!storeId) {
            this.showError("Please select a store first.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
            return;
        }

        try {
            const storeAccounts = this.accounts.filter(acc =>
                acc.store_id == storeId &&
                (acc.account_type.name.includes('Inventory') || acc.account_type.category === 'Asset' && !acc.account_type.name.includes('Checking') && !acc.account_type.name.includes('Savings') && !acc.account_type.name.includes('Points') && !acc.account_type.name.includes('Amazon Seller Central'))
            );

            let inventoryHtml = '<h4>INVENTORY</h4>';
            let otherAssetsHtml = '<h4>OTHER ASSETS</h4>';

            storeAccounts.forEach(account => {
                const savedBalance = this.wizardData.inventoryAndAssets?.[account.id] !== undefined ? this.wizardData.inventoryAndAssets[account.id] : '';
                const inputHtml = `
                    <div class="account-input">
                        <label>${account.account_name}:</label>
                        <input type="number" class="neon-input" data-account-id="${account.id}" placeholder="0.00" step="0.01" value="${savedBalance}">
                    </div>
                `;
                if (account.account_type.name.includes('Inventory')) {
                    inventoryHtml += inputHtml;
                } else {
                    otherAssetsHtml += inputHtml;
                }
            });

            const stepContent = `
                <div class="wizard-step active" id="step3">
                    <h3>INVENTORY & ASSETS</h3>
                    <div class="assets-grid">
                        <div class="asset-group">${inventoryHtml}</div>
                        <div class="asset-group">${otherAssetsHtml}</div>
                    </div>
                </div>
            `;

            const existingStep3 = document.getElementById('step3');
            if (existingStep3) {
                existingStep3.remove();
            }
            document.getElementById('wizardContent').insertAdjacentHTML('beforeend', stepContent);

        } catch (error) {
            console.error("Failed to load inventory and assets for wizard:", error);
            this.showError("Failed to load inventory and assets. Please try again.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
        }
    }
    
    async loadLiabilitiesStep() {
        const storeId = this.wizardData.store_id;
        if (!storeId) {
            this.showError("Please select a store first.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
            return;
        }

        try {
            const storeAccounts = this.accounts.filter(acc =>
                acc.store_id == storeId &&
                acc.account_type.category === 'Liability' &&
                (!acc.account_type.name.includes('Checking') && !acc.account_type.name.includes('Savings') && !acc.account_type.name.includes('Points') && !acc.account_type.name.includes('Amazon Seller Central'))
            );

            let creditCardsHtml = '<h4>CREDIT CARDS</h4>';
            let loansHtml = '<h4>LOANS</h4>';
            let otherLiabilitiesHtml = '<h4>OTHER LIABILITIES</h4>';

            storeAccounts.forEach(account => {
                const savedBalance = this.wizardData.liabilities?.[account.id] !== undefined ? this.wizardData.liabilities[account.id] : '';
                const inputHtml = `
                    <div class="account-input">
                        <label>${account.account_name} (${account.account_number ? '...' + String(account.account_number).slice(-4) : 'N/A'}):</label>
                            <input type="number" class="neon-input" data-account-id="${account.id}" placeholder="0.00" step="0.01" value="${savedBalance}">
                        </div>
                    `;
                if (account.account_type.name.toLowerCase().includes('credit card')) {
                    creditCardsHtml += inputHtml;
                } else if (account.account_type.name.toLowerCase().includes('loan')) {
                    loansHtml += inputHtml;
                } else {
                    otherLiabilitiesHtml += inputHtml;
                }
            });

            const stepContent = `
                <div class="wizard-step active" id="step4">
                    <h3>LIABILITIES</h3>
                    <div class="liabilities-grid">
                        <div class="liability-group">${creditCardsHtml}</div>
                        <div class="liability-group">${loansHtml}</div>
                        <div class="liability-group">${otherLiabilitiesHtml}</div>
                    </div>
                </div>
            `;

            const existingStep4 = document.getElementById('step4');
            if (existingStep4) {
                existingStep4.remove();
            }
            document.getElementById('wizardContent').insertAdjacentHTML('beforeend', stepContent);

        } catch (error) {
            console.error("Failed to load liabilities for wizard:", error);
            this.showError("Failed to load liabilities. Please try again.");
            this.currentStep = 1; // Go back to step 1
            this.updateWizardStep();
        }
    }
    
    async loadReviewStep() {
        const store = this.stores.find(s => s.id == this.wizardData.store_id);
        const snapshotDate = this.wizardData.snapshot_date;

        let bankBalancesHtml = '';
        if (Object.keys(this.wizardData.bankBalances || {}).length > 0) {
            bankBalancesHtml =
                `<div class="summary-section">
                    <h4>BANK BALANCES</h4>`;
            for (const accountId in this.wizardData.bankBalances) {
                const balance = this.wizardData.bankBalances[accountId];
                const account = this.findAccountById(accountId);
                if (account) {
                    bankBalancesHtml += `
                        <div class="summary-item">
                            <span>${account.account_name} (${account.account_number ? '...' + String(account.account_number).slice(-4) : 'N/A'})</span>
                            <span>${this.formatCurrency(balance)}</span>
                        </div>`;
                }
            }
            bankBalancesHtml += `</div>`;
        }

        let inventoryAssetsHtml = '';
        if (Object.keys(this.wizardData.inventoryAndAssets || {}).length > 0) {
            inventoryAssetsHtml =
                `<div class="summary-section">
                    <h4>INVENTORY & OTHER ASSETS</h4>`;
            for (const accountId in this.wizardData.inventoryAndAssets) {
                const balance = this.wizardData.inventoryAndAssets[accountId];
                const account = this.findAccountById(accountId);
                if (account) {
                    inventoryAssetsHtml += `
                        <div class="summary-item">
                            <span>${account.account_name}</span>
                            <span>${this.formatCurrency(balance)}</span>
                        </div>`;
                }
            }
            inventoryAssetsHtml += `</div>`;
        }

        let liabilitiesHtml = '';
        if (Object.keys(this.wizardData.liabilities || {}).length > 0) {
            liabilitiesHtml =
                `<div class="summary-section">
                    <h4>LIABILITIES</h4>`;
            for (const accountId in this.wizardData.liabilities) {
                const balance = this.wizardData.liabilities[accountId];
                const account = this.findAccountById(accountId);
                if (account) {
                    liabilitiesHtml += `
                        <div class="summary-item">
                            <span>${account.account_name} (${account.account_number ? '...' + String(account.account_number).slice(-4) : 'N/A'})</span>
                            <span>${this.formatCurrency(balance)}</span>
                        </div>`;
                }
            }
            liabilitiesHtml += `</div>`;
        }

        const stepContent = `
            <div class="wizard-step active" id="step5">
                <h3>REVIEW & SAVE</h3>
                <div class="review-summary">
                    <div class="summary-section">
                        <h4>SNAPSHOT DETAILS</h4>
                        <div class="summary-item">
                            <span>Store:</span>
                            <span>${store ? store.name : 'N/A'}</span>
                        </div>
                        <div class="summary-item">
                            <span>Snapshot Date:</span>
                            <span>${this.formatDate(snapshotDate)}</span>
                        </div>
                    </div>
                    ${bankBalancesHtml}
                    ${inventoryAssetsHtml}
                    ${liabilitiesHtml}
                </div>
            </div>
        `;

        const existingStep5 = document.getElementById('step5');
        if (existingStep5) {
            existingStep5.remove();
        }
        document.getElementById('wizardContent').insertAdjacentHTML('beforeend', stepContent);
    }

    validateCurrentStep() {
        let isValid = true;
        const errorContainer = document.getElementById('wizardError');
        if (errorContainer) errorContainer.textContent = ''; // Clear previous errors

        switch (this.currentStep) {
            case 1:
                const storeId = document.getElementById('wizardStore').value;
                const snapshotDate = document.getElementById('wizardDate').value;
                if (!storeId) {
                    this.showError("Please select a store.");
                    isValid = false;
                }
                if (!snapshotDate) {
                    this.showError("Please select a snapshot date.");
                    isValid = false;
                }
                break;
            case 2:
                const bankInputs = document.querySelectorAll('#step2 input[type="number"]');
                bankInputs.forEach(input => {
                    if (input.value && isNaN(parseFloat(input.value))) {
                        this.showError("Please enter valid numbers for bank balances.");
                        isValid = false;
                    }
                });
                break;
            case 3:
                const inventoryInputs = document.querySelectorAll('#step3 input[type="number"]');
                inventoryInputs.forEach(input => {
                    if (input.value && isNaN(parseFloat(input.value))) {
                        this.showError("Please enter valid numbers for inventory and assets.");
                        isValid = false;
                    }
                });
                break;
            case 4:
                const liabilityInputs = document.querySelectorAll('#step4 input[type="number"]');
                liabilityInputs.forEach(input => {
                    if (input.value && isNaN(parseFloat(input.value))) {
                        this.showError("Please enter valid numbers for liabilities.");
                        isValid = false;
                    }
                });
                break;
        }
        return isValid;
    }
    
    saveCurrentStepData() {
        switch (this.currentStep) {
            case 1:
                this.wizardData.store_id = document.getElementById('wizardStore').value;
                this.wizardData.snapshot_date = document.getElementById('wizardDate').value;
                break;
            case 2:
                const bankBalances = {};
                document.querySelectorAll('#step2 input[type="number"]').forEach(input => {
                    const accountId = input.dataset.accountId;
                    const balance = parseFloat(input.value);
                    if (!isNaN(balance)) {
                        bankBalances[accountId] = balance;
                    }
                });
                this.wizardData.bankBalances = bankBalances;
                break;
            case 3:
                const inventoryAndAssets = {};
                document.querySelectorAll('#step3 input[type="number"]').forEach(input => {
                    const accountId = input.dataset.accountId;
                    const balance = parseFloat(input.value);
                    if (!isNaN(balance)) {
                        inventoryAndAssets[accountId] = balance;
                    }
                });
                this.wizardData.inventoryAndAssets = inventoryAndAssets;
                break;
            case 4:
                const liabilities = {};
                document.querySelectorAll('#step4 input[type="number"]').forEach(input => {
                    const accountId = input.dataset.accountId;
                    const balance = parseFloat(input.value);
                    if (!isNaN(balance)) {
                        liabilities[accountId] = balance;
                    }
                });
                this.wizardData.liabilities = liabilities;
                break;
        }
    }
    
    async completeWizard() {
        try {
            this.showLoading(true);
            const snapshotData = {
                store_id: parseInt(this.wizardData.store_id),
                snapshot_date: this.wizardData.snapshot_date,
                balances: []
            };

            // Collect bank balances
            for (const accountId in this.wizardData.bankBalances) {
                snapshotData.balances.push({
                    account_id: parseInt(accountId),
                    balance: this.wizardData.bankBalances[accountId]
                });
            }

            // Collect inventory and assets
            for (const accountId in this.wizardData.inventoryAndAssets) {
                snapshotData.balances.push({
                    account_id: parseInt(accountId),
                    balance: this.wizardData.inventoryAndAssets[accountId]
                });
            }

            // Collect liabilities
            for (const accountId in this.wizardData.liabilities) {
                snapshotData.balances.push({
                    account_id: parseInt(accountId),
                    balance: -Math.abs(this.wizardData.liabilities[accountId]) // Liabilities are stored as negative values
                });
            }

            const response = await this.apiCall('/snapshots', {
                method: 'POST',
                body: JSON.stringify(snapshotData)
            });

            if (response.success) {
                this.showMessage("Snapshot created successfully!", "success");
                this.closeWizard();
                this.loadDashboardData(); // Refresh dashboard
            } else {
                this.showError(`Failed to create snapshot: ${response.error}`);
            }
        } catch (error) {
            console.error("Error completing wizard:", error);
            this.showError("An unexpected error occurred while creating the snapshot.");
        } finally {
            this.showLoading(false);
        }
    }
    
    // ===== EVENT HANDLERS =====
    
    setupEventListeners() {
        document.getElementById('newSnapshotBtn')?.addEventListener('click', () => this.openWizard());
        document.getElementById('closeWizardBtn')?.addEventListener('click', () => this.closeWizard());
        document.getElementById('prevBtn')?.addEventListener('click', () => this.previousStep());
        document.getElementById('nextBtn')?.addEventListener('click', () => this.nextStep());
        document.getElementById('refreshDataBtn')?.addEventListener('click', () => this.refreshData());

        // Dashboard filters
        document.getElementById('snapshotDate')?.addEventListener('change', () => this.loadDashboardData());
        document.getElementById('timelineRange')?.addEventListener('change', (e) => this.loadTimelineData(e.target.value));
        document.getElementById('searchSnapshots')?.addEventListener('input', (e) => this.filterSnapshots(e.target.value));
        document.getElementById('storeFilter')?.addEventListener('change', (e) => this.filterSnapshotsByStore(e.target.value));
    }
    
    async loadTimelineData(days) {
        try {
            const response = await this.apiCall(`/dashboard/timeline?days=${days}`);
            this.updateChart(response.timeline);
        } catch (error) {
            console.error('Failed to load timeline data:', error);
        }
    }
    
    filterSnapshots(searchTerm) {
        // Implement search filtering
        console.log('Filtering snapshots:', searchTerm);
        const filtered = this.snapshots.filter(snapshot =>
            snapshot.store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            snapshot.snapshot_date.includes(searchTerm)
        );
        this.updateSnapshotsTable(filtered);
    }
    
    filterSnapshotsByStore(storeId) {
        // Implement store filtering
        console.log('Filtering by store:', storeId);
        const filtered = storeId ? this.snapshots.filter(snapshot => snapshot.store_id == storeId) : this.snapshots;
        this.updateSnapshotsTable(filtered);
    }
    
    async refreshData() {
        await this.loadDashboardData();
        this.showMessage('Data refreshed successfully!', 'success');
    }
    
    viewSnapshot(snapshotId) {
        console.log('Viewing snapshot:', snapshotId);
        // Implement snapshot detail view - for now, just log
        this.showMessage(`Viewing details for Snapshot ID: ${snapshotId}`, 'info');
    }
    
    // ===== UTILITY METHODS =====
    
    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '$0';
        const num = parseFloat(amount);
        if (isNaN(num)) return '$0';
        
        const absNum = Math.abs(num);
        let formatted;
        
        if (absNum >= 1000000) {
            formatted = `$${(num / 1000000).toFixed(1)}M`;
        } else if (absNum >= 1000) {
            formatted = `$${(num / 1000).toFixed(1)}K`;
        } else {
            formatted = `$${num.toFixed(2)}`;
        }
        return formatted;
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    }

    setCurrentDate() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months start at 0!
        const dd = String(today.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        
        const wizardDateInput = document.getElementById('wizardDate');
        if (wizardDateInput) {
            wizardDateInput.value = formattedDate;
        }
    }

    findAccountById(accountId) {
        return this.accounts.find(acc => acc.id == accountId);
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    showMessage(message, type = 'info') {
        // A simple message display, could be enhanced with a dedicated toast/notification system
        alert(`${type.toUpperCase()}: ${message}`);
    }

    showError(message) {
        this.showMessage(message, 'error');
    }
}

let dashboardInstance = null;
document.addEventListener("DOMContentLoaded", () => {
    if (!dashboardInstance) {
        dashboardInstance = new BalanceSheetDashboard();
        window.dashboard = dashboardInstance; // Make it globally accessible if needed
    }
});
