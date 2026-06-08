
// ==================== API 调用工具 ====================
class ApiClient {
    constructor() {
        this.baseUrl = () => {
            const ip = document.getElementById('ipInput')?.value || 'localhost';
            return `http://${ip}:8081/api`;
        };
    }

    getHeaders() {
        return connectionManager ? connectionManager.getHeaders() : {};
    }

    async get(endpoint, params = {}) {
        const url = new URL(`${this.baseUrl()}/${endpoint}`);
        Object.entries(params).forEach(([key, value]) => {
            if (value) url.searchParams.append(key, value);
        });
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: this.getHeaders()
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data;
    }

    async post(endpoint, data = {}) {
        const response = await fetch(`${this.baseUrl()}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...this.getHeaders()
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }
        return result;
    }
}

// ==================== 标签页管理器 ====================
class TabManager {
    constructor() {
        this.init();
    }

    init() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = btn.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });

        if (tabId === 'assets' && window.assetManager) {
            window.assetManager.loadAssetList();
        }
        if (tabId === 'finance' && window.financeManager) {
            window.financeManager.loadPendingList();
        }
        if (tabId === 'scrap' && window.scrapManager) {
            window.scrapManager.loadScrapList();
        }
    }
}

// ==================== UI 管理器 (模态框系统) ====================
class UIManager {
    constructor() {
        this.overlay = document.getElementById('globalOverlay');

        // Confirm Modal Elements
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmTitle = document.getElementById('confirmTitle');
        this.confirmMessage = document.getElementById('confirmMessage');
        this.confirmOkBtn = document.getElementById('confirmOkBtn');
        this.confirmCancelBtn = document.getElementById('confirmCancelBtn');

        // Alert Modal Elements
        this.alertModal = document.getElementById('alertModal');
        this.alertMessage = document.getElementById('alertMessage');
        this.alertOkBtn = document.getElementById('alertOkBtn');

        this.init();
    }

    init() {
        // Bind generic close events
        if (this.confirmCancelBtn) {
            this.confirmCancelBtn.addEventListener('click', () => this.hideConfirm());
        }
        if (this.alertOkBtn) {
            this.alertOkBtn.addEventListener('click', () => this.hideAlert());
        }
    }

    showOverlay() {
        if (this.overlay) this.overlay.classList.remove('hidden');
    }

    hideOverlay() {
        // Only hide if no other modals are open (checked via class logic or simple counter)
        // For simplicity, we manage overlay visibility per modal type in their show/hide methods
        // But to prevent conflicts, we'll force show/hide based on active modals
        if (this.confirmModal.classList.contains('hidden') &&
            this.alertModal.classList.contains('hidden') &&
            document.getElementById('settingsModal').classList.contains('hidden')) {
            if (this.overlay) this.overlay.classList.add('hidden');
        }
    }

    // Custom Confirm Dialog
    confirm(message, onConfirm, title = '确认操作') {
        if (!this.confirmModal) return;

        this.confirmTitle.textContent = title;
        this.confirmMessage.textContent = message;

        // Clean up old listeners
        const newOkBtn = this.confirmOkBtn.cloneNode(true);
        this.confirmOkBtn.parentNode.replaceChild(newOkBtn, this.confirmOkBtn);
        this.confirmOkBtn = newOkBtn;

        this.confirmOkBtn.addEventListener('click', () => {
            this.hideConfirm();
            if (onConfirm) onConfirm();
        });

        this.showOverlay();
        this.confirmModal.classList.remove('hidden');
    }

    hideConfirm() {
        if (this.confirmModal) this.confirmModal.classList.add('hidden');
        this.hideOverlay();
    }

    // Custom Alert Dialog
    alert(message, title = '提示') {
        if (!this.alertModal) return;

        document.getElementById('alertTitle').textContent = title;
        this.alertMessage.textContent = message;

        this.showOverlay();
        this.alertModal.classList.remove('hidden');
    }

    hideAlert() {
        if (this.alertModal) this.alertModal.classList.add('hidden');
        this.hideOverlay();
    }
}

// ==================== 数据库连接管理器 ====================
class ConnectionManager {
    constructor() {
        this.connectionsKey = 'fa_query_connections_v5'; // Key upgrade
        this.activeIdKey = 'fa_query_active_connection_id_v5';

        this.modal = document.getElementById('settingsModal');
        this.openBtn = document.getElementById('settingsBtn');
        this.closeBtn = document.getElementById('closeSettings');

        this.init();
    }

    init() {
        this.ensureDefaultConnection();

        if (this.openBtn) this.openBtn.addEventListener('click', () => this.openConnectionsModal());
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeModal());
    }

    ensureDefaultConnection() {
        const connections = this.getConnections();
        // Check if default MySQL connection exists
        if (!connections.find(c => c.id === 'default-mysql')) {
            const defaultConn = {
                id: 'default-mysql',
                name: '系统默认数据库 (MySQL)',
                type: 'default', // Special type for internal docker default
                isDefault: true,
                canDelete: false,
                createdAt: new Date().toISOString()
            };
            // Add to start
            connections.unshift(defaultConn);
            this.saveConnections(connections);
        }

        // Ensure an active connection is set
        if (!this.getActiveConnectionId()) {
            this.setActiveConnection('default-mysql');
        }
    }

    getConnections() {
        const stored = localStorage.getItem(this.connectionsKey);
        return stored ? JSON.parse(stored) : [];
    }

    saveConnections(connections) {
        localStorage.setItem(this.connectionsKey, JSON.stringify(connections));
    }

    getActiveConnectionId() {
        return localStorage.getItem(this.activeIdKey);
    }

    setActiveConnection(id) {
        localStorage.setItem(this.activeIdKey, id);
    }

    getActiveConnection() {
        const id = this.getActiveConnectionId();
        const connections = this.getConnections();
        return connections.find(c => c.id === id) || connections[0];
    }

    addConnection(config) {
        const connections = this.getConnections();
        const newConn = {
            id: 'conn-' + Date.now(),
            name: config.name || '新连接',
            type: 'mysql', // Only MySQL supported now
            isDefault: false,
            canDelete: true,
            createdAt: new Date().toISOString(),
            ...config
        };
        connections.push(newConn);
        this.saveConnections(connections);
        return newConn;
    }

    updateConnection(id, config) {
        const connections = this.getConnections();
        const index = connections.findIndex(c => c.id === id);
        if (index !== -1) {
            connections[index] = { ...connections[index], ...config };
            this.saveConnections(connections);
        }
    }

    deleteConnection(id) {
        uiManager.confirm('确定要删除这个连接配置吗？不可恢复。', () => {
            let connections = this.getConnections();
            const conn = connections.find(c => c.id === id);

            if (conn && !conn.canDelete) {
                uiManager.alert('系统默认连接不能删除');
                return;
            }

            connections = connections.filter(c => c.id !== id);
            this.saveConnections(connections);

            if (this.getActiveConnectionId() === id) {
                this.setActiveConnection('default-mysql');
            }

            this.renderConnectionsList();
        }, '删除连接');
    }

    parseConnectionString(connStr) {
        try {
            const mysqlMatch = connStr.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
            if (mysqlMatch) {
                return {
                    type: 'mysql',
                    user: decodeURIComponent(mysqlMatch[1]),
                    pass: decodeURIComponent(mysqlMatch[2]),
                    host: mysqlMatch[3],
                    port: mysqlMatch[4],
                    dbname: mysqlMatch[5]
                };
            }
            throw new Error('仅支持 MySQL 连接字符串 (mysql://user:pass@host:port/dbname)');
        } catch (e) {
            throw new Error('连接字符串解析失败：' + e.message);
        }
    }

    getHeaders() {
        const conn = this.getActiveConnection();
        // Default (Internal Docker MySQL) -> No Headers (Backend uses Env)
        if (!conn || conn.type === 'default') {
            return {};
        }

        // Custom External MySQL
        if (conn.type === 'mysql') {
            return {
                'X-DB-CONNECTION': 'mysql',
                'X-DB-HOST': conn.host || '',
                'X-DB-PORT': conn.port || '3306',
                'X-DB-NAME': conn.dbname || '',
                'X-DB-USER': conn.user || '',
                'X-DB-PASSWORD': conn.pass || ''
            };
        }

        return {};
    }

    getCurrentConnectionName() {
        const conn = this.getActiveConnection();
        return conn ? conn.name : '未知连接';
    }

    openConnectionsModal() {
        this.renderConnectionsList();
        if (this.modal) {
            this.modal.classList.remove('hidden');
            uiManager.showOverlay();
        }
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            uiManager.hideOverlay();
        }
    }

    renderConnectionsList() {
        const connections = this.getConnections();
        const activeId = this.getActiveConnectionId();

        let html = `
            <div class="mb-6">
                <button onclick="window.connectionManager.showConnectionForm()" 
                    class="w-full py-3 px-4 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-100 hover:border-indigo-200 transition-all font-semibold flex items-center justify-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    新增 MySQL 连接
                </button>
            </div>
            <div class="space-y-3">
        `;

        connections.forEach(conn => {
            const isActive = conn.id === activeId;
            const activeClass = isActive ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'border border-gray-100 hover:bg-gray-50';
            const isDefault = conn.type === 'default';

            html += `
                <div class="rounded-lg p-4 transition-all duration-200 ${activeClass}">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-3 mb-1">
                                <span class="text-base font-bold text-gray-800">${conn.name}</span>
                                ${isActive ? '<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">当前使用</span>' : ''}
                            </div>
                            <div class="text-sm text-gray-500 flex items-center gap-2">
                                <span class="uppercase font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs ">${isDefault ? 'SYSTEM' : 'MYSQL'}</span>
                                ${!isDefault ? `<span class="truncate max-w-[200px]">${conn.host}:${conn.port}</span>` : '<span class="text-gray-400 italic">内置容器数据库</span>'}
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${!isActive ? `<button onclick="window.connectionManager.handleSetActive('${conn.id}')" class="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition">启用</button>` : ''}
                            
                            ${!isDefault ? `
                            <button onclick="window.connectionManager.showConnectionForm('${conn.id}')" class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition" title="编辑">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                            <button onclick="window.connectionManager.deleteConnection('${conn.id}')" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="删除">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                            ` : '<div class="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded">系统预设</div>'}
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';

        const modalBody = this.modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = html;
    }

    handleSetActive(id) {
        this.setActiveConnection(id);
        this.renderConnectionsList();
    }

    showConnectionForm(editId = null) {
        const connections = this.getConnections();
        const conn = editId ? connections.find(c => c.id === editId) : null;
        const isEdit = !!conn;

        // Default connection cannot be edited, but logic prevents regular users from reaching here via UI for default conn

        const html = `
            <form id="connectionForm" class="space-y-5" novalidate>
                <div class="flex items-center gap-2 text-gray-500 mb-2 cursor-pointer hover:text-gray-800 transition-colors w-max" onclick="window.connectionManager.renderConnectionsList()">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    <span class="text-sm font-medium">返回连接列表</span>
                </div>

                <!-- 生产环境警告 -->
                <div class="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md">
                    <div class="flex">
                        <div class="flex-shrink-0">
                            <svg class="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <div class="ml-3">
                            <p class="text-sm text-amber-700">
                                <strong>注意：</strong>新增连接需配置 <span class="font-bold underline">Public (公网) 可访问的生产环境数据库</span>。配置错误可能导致无法连接，建议仅限高级技术人员尝试。
                            </p>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1.5">连接名称</label>
                    <input type="text" id="connName" value="${conn ? conn.name : ''}" placeholder="例如：生产环境 MySQL" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow">
                </div>
                
                <input type="hidden" id="connType" value="mysql">

                <div class="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                    <label class="block text-xs font-bold text-blue-700 uppercase mb-2">快速填充</label>
                    <div class="flex gap-2">
                        <input type="text" id="connString" placeholder="mysql://user:pass@host:port/dbname" class="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded placeholder-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <button type="button" onclick="window.connectionManager.parseAndFillForm()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded font-medium hover:bg-blue-700 transition">解析</button>
                    </div>
                </div>

                <div id="mysqlFields" class="space-y-4 animate-fade-in">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">主机地址</label>
                            <input type="text" id="connHost" value="${conn && conn.host || ''}" placeholder="127.0.0.1" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">端口</label>
                            <input type="text" id="connPort" value="${conn && conn.port || '3306'}" placeholder="3306" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                            <input type="text" id="connUser" value="${conn && conn.user || ''}" placeholder="root" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
                            <input type="password" id="connPass" value="${conn && conn.pass || ''}" placeholder="密码" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">数据库名</label>
                        <input type="text" id="connDbname" value="${conn && conn.dbname || ''}" placeholder="fixed_assets" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                    </div>
                </div>

                <div class="flex gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onclick="window.connectionManager.renderConnectionsList()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-medium">取消</button>
                    <button type="button" onclick="window.connectionManager.saveConnectionFromForm('${editId || ''}')" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-bold shadow-sm">${isEdit ? '保存修改' : '创建连接'}</button>
                </div>
            </form>
        `;

        const modalBody = this.modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = html;

        const form = document.getElementById('connectionForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveConnectionFromForm(editId);
            });
        }
    }

    parseAndFillForm() {
        const connString = document.getElementById('connString').value.trim();
        if (!connString) {
            uiManager.alert('请输入连接字符串');
            return;
        }

        try {
            const parsed = this.parseConnectionString(connString);

            // Auto fill
            if (parsed.type === 'mysql') {
                document.getElementById('connHost').value = parsed.host || '';
                document.getElementById('connPort').value = parsed.port || '3306';
                document.getElementById('connDbname').value = parsed.dbname || '';
                document.getElementById('connUser').value = parsed.user || '';
                document.getElementById('connPass').value = parsed.pass || '';
            }
            uiManager.alert('解析成功，表单已自动填充', '操作成功');
        } catch (e) {
            uiManager.alert(e.message, '解析错误');
        }
    }

    // 辅助：翻译常见数据库错误
    translateError(errorMsg) {
        if (!errorMsg) return '未知错误';
        if (errorMsg.includes('Access denied')) return '数据库访问被拒绝：用户名或密码错误';
        if (errorMsg.includes('Unknown database')) return '数据库不存在：请检查数据库名称';
        if (errorMsg.includes('Connection refused')) return '连接被拒绝：请检查主机地址和端口';
        if (errorMsg.includes('timed out')) return '连接超时：服务器无响应';
        if (errorMsg.includes('getaddrinfo failed')) return '主机名解析失败：请检查主机地址';
        return errorMsg;
    }

    saveConnectionFromForm(editId) {
        const name = document.getElementById('connName').value.trim();
        const type = 'mysql';

        // 1. 基础校验
        if (!name) {
            uiManager.alert('请输入连接名称', '校验失败');
            return;
        }

        const config = { name, type };
        config.host = document.getElementById('connHost').value.trim();
        config.port = document.getElementById('connPort').value.trim();
        config.dbname = document.getElementById('connDbname').value.trim();
        config.user = document.getElementById('connUser').value.trim();
        config.pass = document.getElementById('connPass').value.trim();

        // 2. 详细字段校验
        if (!config.host) {
            uiManager.alert('请输入主机地址 (IP 或域名)', '校验失败');
            return;
        }

        if (!config.port) {
            uiManager.alert('请输入端口号', '校验失败');
            return;
        }
        const portNum = parseInt(config.port, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            uiManager.alert('端口号必须是 1 到 65535 之间的数字', '校验失败');
            return;
        }

        if (!config.user) {
            uiManager.alert('请输入数据库用户名', '校验失败');
            return;
        }

        if (!config.dbname) {
            uiManager.alert('请输入数据库名称', '校验失败');
            return;
        }

        // 密码允许为空，但通常给个提醒? 不，视具体情况，这里不做强制。

        if (editId) {
            this.updateConnection(editId, config);
            uiManager.alert('连接配置已更新', '操作成功');
        } else {
            this.addConnection(config);
            uiManager.alert('新连接已创建', '操作成功');
        }

        this.renderConnectionsList();
    }
}

// ==================== 查询历史管理器 ====================
class HistoryManager {
    constructor() {
        this.storageKey = 'fa_query_history_v5'; // New storage key
        this.maxItems = 20;
        this.listEl = document.getElementById('historyList');
        this.emptyEl = document.getElementById('emptyHistory');
        this.clearBtn = document.getElementById('clearHistoryBtn');

        this.init();
    }

    init() {
        this.render();

        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                uiManager.confirm('确定要清空所有历史记录吗？不可恢复。', () => {
                    this.clear();
                }, '清空历史');
            });
        }

        if (this.listEl) {
            this.listEl.addEventListener('click', (e) => {
                const item = e.target.closest('.history-item');
                if (!item) return;

                if (e.target.closest('.delete-btn')) {
                    e.stopPropagation();
                    const timestamp = parseInt(item.dataset.timestamp);
                    uiManager.confirm('确定要删除这条历史记录吗？', () => {
                        this.remove(timestamp);
                    }, '删除记录');
                    return;
                }

                const facode = item.dataset.facode;
                const ip = item.dataset.ip;
                const facodeInput = document.getElementById('facodeInput');
                const ipInput = document.getElementById('ipInput');
                const form = document.getElementById('queryForm');

                if (facodeInput && ipInput && form) {
                    facodeInput.value = facode;
                    ipInput.value = ip;
                    form.dispatchEvent(new Event('submit'));
                }
            });
        }
    }

    getHistory() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    add(record) {
        const history = this.getHistory();
        record.timestamp = Date.now();
        record.connectionName = connectionManager.getCurrentConnectionName();
        history.unshift(record);
        if (history.length > this.maxItems) history.pop();

        localStorage.setItem(this.storageKey, JSON.stringify(history));
        this.render();
    }

    remove(timestamp) {
        let history = this.getHistory();
        history = history.filter(h => h.timestamp !== timestamp);
        localStorage.setItem(this.storageKey, JSON.stringify(history));
        this.render();
    }

    clear() {
        localStorage.removeItem(this.storageKey);
        this.render();
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    }

    render() {
        const history = this.getHistory();

        if (!this.listEl || !this.emptyEl) return;

        if (history.length === 0) {
            this.listEl.innerHTML = '';
            this.emptyEl.classList.remove('hidden');
            return;
        }

        this.emptyEl.classList.add('hidden');

        this.listEl.innerHTML = history.map(h => `
            <div class="history-item bg-white border border-gray-100 rounded-lg p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
                 data-facode="${h.facode}" data-ip="${h.ip}" data-timestamp="${h.timestamp}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-bold text-gray-800 text-lg">${h.facode}</span>
                            <span class="px-2 py-0.5 ${h.sn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'} text-xs font-bold rounded-full uppercase tracking-wide">
                                ${h.sn ? '已找到' : '未找到'}
                            </span>
                        </div>
                        ${h.sn ? `<div class="text-sm font-mono text-gray-600 mb-2">SN: ${h.sn}</div>` : ''}
                        <div class="flex items-center text-xs text-gray-400 gap-2">
                            <span>${this.formatTime(h.timestamp)}</span>
                            ${h.connectionName ? `<span class="bg-gray-50 px-1 rounded text-gray-500">${h.connectionName}</span>` : ''}
                        </div>
                    </div>
                    <button class="delete-btn text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded transition-all opacity-0 group-hover:opacity-100" title="删除">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// ==================== 资产列表管理器 ====================
class AssetManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.container = document.getElementById('assetListContainer');
    }

    getStatusText(status) {
        const map = {
            'in_use': '使用中',
            'borrowed': '借用中',
            'idle': '闲置',
            'scrap_pending': '待报废',
            'scrapped': '已报废'
        };
        return map[status] || status;
    }

    getStatusClass(status) {
        return `status-${status}`;
    }

    async loadAssetList() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="mt-3 text-gray-500">加载中...</p>
            </div>
        `;

        try {
            const result = await this.api.get('asset_list.php');
            
            if (!result.data || result.data.length === 0) {
                this.container.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        <p>暂无资产数据</p>
                    </div>
                `;
                return;
            }

            this.container.innerHTML = result.data.map(asset => `
                <div class="asset-card">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <div class="flex items-center gap-3 mb-1">
                                <span class="text-lg font-bold text-gray-900">${asset.asset_name}</span>
                                <span class="status-badge ${this.getStatusClass(asset.status)}">${this.getStatusText(asset.status)}</span>
                            </div>
                            <div class="flex items-center gap-4 text-sm text-gray-500">
                                <span class="font-mono">${asset.facode}</span>
                                <span>SN: ${asset.sn}</span>
                                <span>${asset.asset_type || '-'}</span>
                            </div>
                        </div>
                        <button onclick="window.scrapManager.initiateScrap('${asset.facode}')" 
                            class="px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-md transition ${asset.status === 'scrapped' || asset.status === 'scrap_pending' ? 'opacity-50 cursor-not-allowed' : ''}"
                            ${asset.status === 'scrapped' || asset.status === 'scrap_pending' ? 'disabled' : ''}>
                            申请报废
                        </button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div class="text-gray-400 mb-1">采购日期</div>
                            <div class="font-medium">${asset.purchase_date || '-'}</div>
                        </div>
                        <div>
                            <div class="text-gray-400 mb-1">采购金额</div>
                            <div class="font-medium">¥${Number(asset.purchase_amount || 0).toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-gray-400 mb-1">当前净值</div>
                            <div class="font-medium">¥${Number(asset.current_value || 0).toFixed(2)}</div>
                        </div>
                        <div>
                            <div class="text-gray-400 mb-1">维修次数</div>
                            <div class="font-medium">${asset.repair_count || 0} 次</div>
                        </div>
                    </div>
                    <div class="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm text-gray-500">
                        <span>保管人: ${asset.custodian || '-'}</span>
                        <span>位置: ${asset.location || '-'}</span>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            this.container.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    加载失败：${error.message}
                </div>
            `;
        }
    }
}

// ==================== 报废流程管理器 ====================
class ScrapManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.currentCheckResult = null;
    }

    initiateScrap(facode) {
        document.getElementById('scrapFacodeInput').value = facode;
        window.tabManager.switchTab('scrap');
        setTimeout(() => this.checkScrap(), 300);
    }

    async checkScrap() {
        const facode = document.getElementById('scrapFacodeInput').value.trim();
        if (!facode) {
            uiManager.alert('请输入固定资产编码');
            return;
        }

        const resultContainer = document.getElementById('scrapCheckResult');
        const applyForm = document.getElementById('scrapApplyForm');
        
        resultContainer.classList.remove('hidden');
        resultContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="mt-3 text-gray-500">正在检查报废条件...</p>
            </div>
        `;
        applyForm.classList.add('hidden');

        try {
            const result = await this.api.get('scrap_check.php', { facode });
            this.currentCheckResult = result.data;
            this.renderCheckResult(result.data);
            
            if (result.data.can_scrap) {
                this.renderApplyForm(result.data);
            }
        } catch (error) {
            resultContainer.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    检查失败：${error.message}
                </div>
            `;
        }
    }

    renderCheckResult(data) {
        const container = document.getElementById('scrapCheckResult');
        const checks = data.checks;

        const getCheckClass = (item) => {
            if (item.passed) return 'passed';
            return 'failed';
        };

        const getIcon = (passed) => {
            if (passed) {
                return `<svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>`;
            }
            return `<svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>`;
        };

        let html = `
            <div class="mb-6">
                <div class="flex items-center gap-3 mb-2">
                    <span class="text-2xl font-bold text-gray-900">${data.asset.asset_name}</span>
                    <span class="font-mono text-gray-500">${data.asset.facode}</span>
                </div>
                <div class="text-sm text-gray-500">SN: ${data.asset.sn}</div>
            </div>

            <!-- 步骤指示器 -->
            <div class="step-indicator mb-6">
                <div class="step completed">
                    <div class="step-number">1</div>
                    <div class="step-label">条件检查</div>
                </div>
                <div class="step ${data.can_scrap ? 'active' : ''}">
                    <div class="step-number">2</div>
                    <div class="step-label">提交申请</div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-label">财务确认</div>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-label">完成报废</div>
                </div>
            </div>

            <!-- 检查结果汇总 -->
            <div class="${data.can_scrap ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'} border rounded-lg p-4 mb-6">
                <div class="flex items-center gap-2 font-bold ${data.can_scrap ? 'text-green-800' : 'text-amber-800'}">
                    ${data.can_scrap ? 
                        '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' :
                        '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>'
                    }
                    ${data.summary}
                </div>
                ${data.warnings.length > 0 ? `
                    <ul class="mt-2 text-sm ${data.can_scrap ? 'text-amber-700' : 'text-red-700'} space-y-1">
                        ${data.warnings.map(w => `<li>• ${w}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>

            <!-- 详细检查项 -->
            <div class="space-y-2 mb-6">
                <h3 class="font-bold text-gray-900 mb-3">报废条件检查</h3>
                
                <div class="check-item ${getCheckClass(checks.serial_number)}">
                    ${getIcon(checks.serial_number.passed)}
                    <div class="ml-3">
                        <div class="font-medium">序列号验证</div>
                        <div class="text-sm">${checks.serial_number.message} (${checks.serial_number.sn})</div>
                    </div>
                </div>

                <div class="check-item ${checks.purchase_date.passed ? 'passed' : 'warning'}">
                    <svg class="w-5 h-5 ${checks.purchase_date.passed ? 'text-green-500' : 'text-amber-500'} flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div class="ml-3">
                        <div class="font-medium">采购日期与使用年限</div>
                        <div class="text-sm">${checks.purchase_date.message}</div>
                    </div>
                </div>

                <div class="check-item ${getCheckClass(checks.depreciation)}">
                    ${getIcon(checks.depreciation.passed)}
                    <div class="ml-3">
                        <div class="font-medium">折旧状态</div>
                        <div class="text-sm">${checks.depreciation.status_text} - ${checks.depreciation.message}</div>
                    </div>
                </div>

                <div class="check-item ${getCheckClass(checks.repair_count)}">
                    ${getIcon(checks.repair_count.passed)}
                    <div class="ml-3">
                        <div class="font-medium">维修次数</div>
                        <div class="text-sm">${checks.repair_count.message}</div>
                    </div>
                </div>

                <div class="check-item ${getCheckClass(checks.borrow_status)}">
                    ${getIcon(checks.borrow_status.passed)}
                    <div class="ml-3">
                        <div class="font-medium">借用状态</div>
                        <div class="text-sm">${checks.borrow_status.message}</div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        container.classList.remove('hidden');
    }

    renderApplyForm(data) {
        const formContainer = document.getElementById('scrapApplyForm');
        formContainer.innerHTML = `
            <div class="bg-gray-50 rounded-lg p-6">
                <h3 class="font-bold text-gray-900 mb-4">提交报废申请</h3>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">申请人 (资产管理员)</label>
                        <input type="text" id="applicantInput" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="请输入您的姓名">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">报废原因</label>
                        <textarea id="scrapReasonInput" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="请详细说明报废原因..."></textarea>
                    </div>
                    <button onclick="window.scrapManager.submitApplication()" 
                        class="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-bold">
                        提交报废申请
                    </button>
                </div>
            </div>
        `;
        formContainer.classList.remove('hidden');
    }

    async submitApplication() {
        const applicant = document.getElementById('applicantInput')?.value.trim();
        const scrapReason = document.getElementById('scrapReasonInput')?.value.trim();
        const facode = document.getElementById('scrapFacodeInput').value.trim();

        if (!applicant) {
            uiManager.alert('请填写申请人');
            return;
        }
        if (!scrapReason) {
            uiManager.alert('请填写报废原因');
            return;
        }

        try {
            const result = await this.api.post('scrap_apply.php', {
                facode,
                applicant,
                scrap_reason: scrapReason,
                check_result: this.currentCheckResult
            });

            uiManager.alert(result.message, '提交成功');
            
            document.getElementById('scrapApplyForm').classList.add('hidden');
            document.getElementById('scrapFacodeInput').value = '';
            this.currentCheckResult = null;
            
            this.loadScrapList();
            
        } catch (error) {
            uiManager.alert(error.message, '提交失败');
        }
    }

    async loadScrapList() {
        const container = document.getElementById('scrapListContainer');
        if (!container) return;

        try {
            const result = await this.api.get('scrap_list.php');
            
            if (!result.data || result.data.length === 0) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = `
                <div class="mt-8 border-t border-gray-200 pt-6">
                    <h3 class="font-bold text-gray-900 mb-4">报废申请历史</h3>
                    <div class="space-y-3">
                        ${result.data.map(item => this.renderScrapItem(item)).join('')}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('加载报废列表失败', error);
        }
    }

    renderScrapItem(item) {
        const statusMap = {
            'pending_finance': { text: '待财务确认', class: 'bg-yellow-100 text-yellow-800' },
            'finance_approved': { text: '财务已批准', class: 'bg-blue-100 text-blue-800' },
            'finance_rejected': { text: '财务已拒绝', class: 'bg-red-100 text-red-800' },
            'completed': { text: '已完成', class: 'bg-green-100 text-green-800' }
        };
        const status = statusMap[item.status] || { text: item.status, class: 'bg-gray-100 text-gray-800' };

        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-3 mb-1">
                            <span class="font-bold">${item.asset_name}</span>
                            <span class="status-badge ${status.class}">${status.text}</span>
                        </div>
                        <div class="text-sm text-gray-500">
                            ${item.facode} | 申请人: ${item.applicant} | ${item.apply_date}
                        </div>
                        <div class="text-sm text-gray-600 mt-2">原因: ${item.scrap_reason}</div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-medium">¥${Number(item.current_value || 0).toFixed(2)}</div>
                        <div class="text-xs text-gray-400">当前净值</div>
                    </div>
                </div>
            </div>
        `;
    }
}

// ==================== 财务确认管理器 ====================
class FinanceManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.container = document.getElementById('financeListContainer');
    }

    async loadPendingList() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="mt-3 text-gray-500">加载中...</p>
            </div>
        `;

        try {
            const result = await this.api.get('scrap_list.php', { status: 'pending_finance' });
            
            if (!result.data || result.data.length === 0) {
                this.container.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <svg class="w-12 h-12 mx-auto mb-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p class="text-green-600 font-medium">暂无待确认的报废申请</p>
                        <button onclick="window.financeManager.loadAllList()" 
                            class="mt-4 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition">
                            查看全部历史
                        </button>
                    </div>
                `;
                return;
            }

            this.container.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-900">待确认报废申请 (${result.data.length})</h3>
                    <button onclick="window.financeManager.loadAllList()" 
                        class="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition">
                        查看全部历史
                    </button>
                </div>
                <div class="space-y-4">
                    ${result.data.map(item => this.renderPendingItem(item)).join('')}
                </div>
            `;
        } catch (error) {
            this.container.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    加载失败：${error.message}
                </div>
            `;
        }
    }

    async loadAllList() {
        if (!this.container) return;

        try {
            const result = await this.api.get('scrap_list.php');
            
            if (!result.data || result.data.length === 0) {
                this.container.innerHTML = `
                    <div class="text-center py-12 text-gray-500">
                        <p>暂无报废申请记录</p>
                        <button onclick="window.financeManager.loadPendingList()" 
                            class="mt-4 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition">
                            返回待确认列表
                        </button>
                    </div>
                `;
                return;
            }

            const statusMap = {
                'pending_finance': { text: '待财务确认', class: 'bg-yellow-100 text-yellow-800' },
                'finance_approved': { text: '财务已批准', class: 'bg-blue-100 text-blue-800' },
                'finance_rejected': { text: '财务已拒绝', class: 'bg-red-100 text-red-800' },
                'completed': { text: '已完成', class: 'bg-green-100 text-green-800' }
            };

            this.container.innerHTML = `
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-gray-900">全部报废申请 (${result.data.length})</h3>
                    <button onclick="window.financeManager.loadPendingList()" 
                        class="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-500 rounded-md transition">
                        查看待确认
                    </button>
                </div>
                <div class="space-y-4">
                    ${result.data.map(item => {
                        const status = statusMap[item.status] || { text: item.status, class: 'bg-gray-100 text-gray-800' };
                        return `
                            <div class="border border-gray-200 rounded-lg p-4">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <div class="flex items-center gap-3 mb-1">
                                            <span class="font-bold">${item.asset_name}</span>
                                            <span class="status-badge ${status.class}">${status.text}</span>
                                        </div>
                                        <div class="text-sm text-gray-500">${item.facode} | ${item.apply_date} | ${item.applicant}</div>
                                    </div>
                                    <div class="text-right">
                                        <div class="text-sm font-medium">¥${Number(item.current_value || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } catch (error) {
            this.container.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    加载失败：${error.message}
                </div>
            `;
        }
    }

    renderPendingItem(item) {
        return `
            <div class="border border-amber-200 bg-amber-50 rounded-lg p-6">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <div class="flex items-center gap-3 mb-2">
                            <span class="text-xl font-bold text-gray-900">${item.asset_name}</span>
                            <span class="status-badge bg-yellow-100 text-yellow-800">待确认</span>
                        </div>
                        <div class="text-sm text-gray-600 space-y-1">
                            <div>资产编码: <span class="font-mono font-medium">${item.facode}</span></div>
                            <div>序列号: <span class="font-mono">${item.sn}</span></div>
                            <div>申请人: ${item.applicant} | 申请日期: ${item.apply_date}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-xs text-gray-500 mb-1">资产净值</div>
                        <div class="text-xl font-bold text-gray-900">¥${Number(item.current_value || 0).toFixed(2)}</div>
                        <div class="text-xs text-gray-400">原值 ¥${Number(item.purchase_amount || 0).toFixed(2)}</div>
                    </div>
                </div>

                <!-- 检查结果 -->
                ${item.check_result ? `
                    <div class="bg-white rounded-lg p-4 mb-4 text-sm">
                        <div class="font-medium mb-2">报废检查结果</div>
                        <div class="grid grid-cols-2 gap-2 text-gray-600">
                            <div>序列号: ${item.check_result.checks?.serial_number?.passed ? '✓ 有效' : '✗ 无效'}</div>
                            <div>使用年限: ${item.check_result.checks?.purchase_date?.usage_years || '-'} 年</div>
                            <div>折旧状态: ${item.check_result.checks?.depreciation?.status_text || '-'}</div>
                            <div>维修次数: ${item.check_result.checks?.repair_count?.count || 0} 次</div>
                        </div>
                        ${item.check_result.warnings?.length > 0 ? `
                            <div class="mt-2 pt-2 border-t border-gray-100 text-amber-600">
                                ⚠️ ${item.check_result.warnings.join('; ')}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}

                <div class="bg-white rounded-lg p-4 mb-4">
                    <div class="font-medium mb-2">报废原因</div>
                    <div class="text-gray-700">${item.scrap_reason}</div>
                </div>

                <!-- 财务确认表单 -->
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">财务确认人</label>
                        <input type="text" id="confirmBy_${item.id}" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="请输入您的姓名">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">财务备注</label>
                        <textarea id="remark_${item.id}" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="可选，填写审批意见..."></textarea>
                    </div>
                    <div class="flex gap-3">
                        <button onclick="window.financeManager.reject(${item.id})" 
                            class="flex-1 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold">
                            拒绝报废
                        </button>
                        <button onclick="window.financeManager.approve(${item.id})" 
                            class="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-bold">
                            批准报废
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async approve(scrapProcessId) {
        const confirmBy = document.getElementById(`confirmBy_${scrapProcessId}`)?.value.trim();
        const remark = document.getElementById(`remark_${scrapProcessId}`)?.value.trim();

        if (!confirmBy) {
            uiManager.alert('请填写确认人');
            return;
        }

        try {
            const result = await this.api.post('scrap_confirm.php', {
                scrap_process_id: scrapProcessId,
                action: 'approve',
                confirm_by: confirmBy,
                remark
            });

            uiManager.alert(result.message, '确认成功');
            this.loadPendingList();
        } catch (error) {
            uiManager.alert(error.message, '操作失败');
        }
    }

    async reject(scrapProcessId) {
        const confirmBy = document.getElementById(`confirmBy_${scrapProcessId}`)?.value.trim();
        const remark = document.getElementById(`remark_${scrapProcessId}`)?.value.trim();

        if (!confirmBy) {
            uiManager.alert('请填写确认人');
            return;
        }
        if (!remark) {
            uiManager.alert('请填写拒绝原因');
            return;
        }

        try {
            const result = await this.api.post('scrap_confirm.php', {
                scrap_process_id: scrapProcessId,
                action: 'reject',
                confirm_by: confirmBy,
                remark
            });

            uiManager.alert(result.message, '确认成功');
            this.loadPendingList();
        } catch (error) {
            uiManager.alert(error.message, '操作失败');
        }
    }
}

// ==================== 扫码检测管理器 ====================
class ScanManager {
    constructor(apiClient) {
        this.api = apiClient;
        this.currentScanData = null;
        this.cameraStream = null;
        this.photoData = null;

        this.init();
    }

    init() {
        const scanInput = document.getElementById('scanFacodeInput');
        if (scanInput) {
            scanInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.checkScan();
                }
            });
        }
    }

    async checkScan() {
        const facode = document.getElementById('scanFacodeInput')?.value.trim();
        if (!facode) {
            uiManager.alert('请输入或扫描资产编码');
            return;
        }

        const resultContainer = document.getElementById('scanResultContainer');
        const formContainer = document.getElementById('scanRecordForm');

        resultContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="mt-3 text-gray-500">正在检测资产状态...</p>
            </div>
        `;
        formContainer.classList.add('hidden');

        try {
            const result = await this.api.get('scrap_scan_check.php', { facode });
            this.currentScanData = result.data;
            this.renderScanResult(result.data);
        } catch (error) {
            resultContainer.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                    检测失败：${error.message}
                </div>
            `;
        }
    }

    renderScanResult(data) {
        const container = document.getElementById('scanResultContainer');
        
        if (!data.asset_found) {
            container.innerHTML = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <svg class="w-16 h-16 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-gray-500">未找到该资产信息</p>
                </div>
            `;
            return;
        }

        if (!data.is_scrapped) {
            container.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded-lg p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-green-800">设备状态正常</h3>
                            <p class="text-sm text-green-600">${data.message}</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <div class="text-gray-500">资产名称</div>
                            <div class="font-medium">${data.asset.asset_name}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">资产编码</div>
                            <div class="font-mono font-medium">${data.asset.facode}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">序列号</div>
                            <div class="font-mono">${data.asset.sn}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">当前状态</div>
                            <span class="status-badge ${this.getStatusClass(data.asset.status)}">${data.asset.status_text}</span>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="risk-alert mb-6">
                <div class="flex items-start gap-4">
                    <div class="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-red-800 mb-1">⚠️ 高风险！该设备已报废</h3>
                        <p class="text-red-700 mb-3">${data.message}</p>
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div class="bg-red-100/50 rounded p-2">
                                <div class="text-red-600 text-xs">资产名称</div>
                                <div class="font-bold text-red-800">${data.asset.asset_name}</div>
                            </div>
                            <div class="bg-red-100/50 rounded p-2">
                                <div class="text-red-600 text-xs">资产编码</div>
                                <div class="font-mono font-bold text-red-800">${data.asset.facode}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            ${data.scrap_info ? `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                    <h4 class="font-bold text-gray-900 mb-2">报废信息</h4>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <div class="text-gray-500">报废完成日期</div>
                            <div class="font-medium">${data.scrap_info.scrap_complete_date || '-'}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">财务确认人</div>
                            <div class="font-medium">${data.scrap_info.finance_confirm_by || '-'}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">报废原因</div>
                            <div class="font-medium">${data.scrap_info.scrap_reason || '-'}</div>
                        </div>
                        <div>
                            <div class="text-gray-500">财务备注</div>
                            <div class="font-medium">${data.scrap_info.finance_remark || '-'}</div>
                        </div>
                    </div>
                </div>
            ` : ''}

            ${data.scan_history && data.scan_history.length > 0 ? `
                <div class="mb-6">
                    <h4 class="font-bold text-gray-900 mb-2">历史扫码记录 (最近5次)</h4>
                    <div class="space-y-2">
                        ${data.scan_history.map(record => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                                <div>
                                    <span class="font-medium">${record.scan_user}</span>
                                    <span class="text-gray-500 ml-2">${record.scan_time}</span>
                                </div>
                                ${record.photo_path ? 
                                    '<span class="text-indigo-600 text-xs">📷 已拍照</span>' : 
                                    '<span class="text-gray-400 text-xs">无照片</span>'
                                }
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        this.renderScanRecordForm(data.asset.facode);
    }

    getStatusClass(status) {
        return `status-${status}`;
    }

    renderScanRecordForm(facode) {
        const formContainer = document.getElementById('scanRecordForm');
        formContainer.innerHTML = `
            <div class="bg-white border-2 border-red-200 rounded-lg p-6">
                <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    请拍照说明扫码原因
                </h3>
                
                <div class="space-y-4">
                    <!-- 拍照区域 -->
                    <div id="cameraSection" class="space-y-3">
                        <div class="flex gap-3">
                            <button onclick="window.scanManager.startCamera()" 
                                class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                打开摄像头
                            </button>
                            <button onclick="window.scanManager.takePhoto()" id="takePhotoBtn"
                                class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-2 hidden">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                拍照
                            </button>
                            <button onclick="window.scanManager.stopCamera()" id="stopCameraBtn"
                                class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2 hidden">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                关闭
                            </button>
                        </div>
                        <video id="cameraPreview" class="hidden" autoplay playsinline></video>
                        <canvas id="photoCanvas" class="hidden"></canvas>
                        <div id="photoPreview" class="hidden">
                            <div class="text-sm text-gray-600 mb-2">已拍摄照片：</div>
                            <img id="capturedPhoto" class="rounded-lg border border-gray-300 max-w-sm">
                            <button onclick="window.scanManager.retakePhoto()" 
                                class="mt-2 text-sm text-red-600 hover:text-red-700">
                                重新拍摄
                            </button>
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">扫码人</label>
                        <input type="text" id="scanUserInput" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="请输入您的姓名">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">说明 (必填)</label>
                        <textarea id="scanRemarkInput" 
                            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="请详细说明为何扫码已报废设备，例如：盘点发现、误扫、设备异常出现等..."></textarea>
                    </div>
                    <button onclick="window.scanManager.submitScanRecord('${facode}')" 
                        class="w-full py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold">
                        提交记录
                    </button>
                </div>
            </div>
        `;
        formContainer.classList.remove('hidden');
    }

    async startCamera() {
        const video = document.getElementById('cameraPreview');
        if (!video) return;

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            video.srcObject = this.cameraStream;
            video.classList.remove('hidden');
            document.getElementById('takePhotoBtn').classList.remove('hidden');
            document.getElementById('stopCameraBtn').classList.remove('hidden');
            document.getElementById('photoPreview').classList.add('hidden');
            this.photoData = null;
        } catch (error) {
            uiManager.alert('无法访问摄像头：' + error.message + '。您可以继续填写说明，拍照为可选项。', '摄像头访问失败');
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        const video = document.getElementById('cameraPreview');
        if (video) video.classList.add('hidden');
        document.getElementById('takePhotoBtn').classList.add('hidden');
        document.getElementById('stopCameraBtn').classList.add('hidden');
    }

    takePhoto() {
        const video = document.getElementById('cameraPreview');
        const canvas = document.getElementById('photoCanvas');
        const img = document.getElementById('capturedPhoto');
        
        if (!video || !canvas || !img) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        this.photoData = canvas.toDataURL('image/jpeg', 0.8);
        img.src = this.photoData;
        
        document.getElementById('photoPreview').classList.remove('hidden');
        video.classList.add('hidden');
        this.stopCamera();
    }

    retakePhoto() {
        this.photoData = null;
        document.getElementById('photoPreview').classList.add('hidden');
        this.startCamera();
    }

    async submitScanRecord(facode) {
        const scanUser = document.getElementById('scanUserInput')?.value.trim();
        const remark = document.getElementById('scanRemarkInput')?.value.trim();

        if (!scanUser) {
            uiManager.alert('请填写扫码人');
            return;
        }
        if (!remark) {
            uiManager.alert('请填写说明');
            return;
        }

        try {
            const result = await this.api.post('scrap_scan_record.php', {
                facode,
                scan_user: scanUser,
                photo_data: this.photoData,
                remark
            });

            uiManager.alert(result.message, '记录已保存');
            
            document.getElementById('scanRecordForm').classList.add('hidden');
            document.getElementById('scanFacodeInput').value = '';
            this.currentScanData = null;
            this.photoData = null;
            
        } catch (error) {
            uiManager.alert(error.message, '提交失败');
        }
    }
}

// ==================== 查询管理器 ====================
class QueryManager {
    constructor() {
        this.form = document.getElementById('queryForm');
        this.resultBox = document.getElementById('resultBox');
        this.errorBox = document.getElementById('errorBox');
        this.loadingEl = document.getElementById('loading');
        this.curlCommand = document.getElementById('curlCommand');

        this.init();
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.performQuery();
            });

            const facodeInput = document.getElementById('facodeInput');
            const ipInput = document.getElementById('ipInput');
            if (facodeInput) facodeInput.addEventListener('input', () => this.updateCurlCommand());
            if (ipInput) ipInput.addEventListener('input', () => this.updateCurlCommand());
        }
        this.updateCurlCommand();
    }

    updateCurlCommand() {
        const facode = document.getElementById('facodeInput')?.value || 'FA001';
        const ip = document.getElementById('ipInput')?.value || 'localhost';
        const headers = connectionManager.getHeaders();

        let curlCmd = `curl "http://${ip}:8081/api/asset_detail.php?facode=${facode}"`;
        Object.entries(headers).forEach(([key, value]) => {
            if (value) curlCmd += ` \\\n  -H "${key}: ${value}"`;
        });

        if (this.curlCommand) this.curlCommand.textContent = curlCmd;
    }

    async performQuery() {
        const facode = document.getElementById('facodeInput')?.value.trim();
        const ip = document.getElementById('ipInput')?.value.trim() || 'localhost';

        if (!ip) {
            uiManager.alert('请输入服务器 IP 地址或域名', '缺少参数');
            return;
        }

        if (!facode) {
            uiManager.alert('请输入固定资产编码', '参数错误');
            return;
        }

        this.showLoading();
        this.hideError();
        this.hideResult();

        try {
            const headers = connectionManager.getHeaders();
            const url = `http://${ip}:8081/api/asset_detail.php?facode=${encodeURIComponent(facode)}`;

            const response = await fetch(url, { method: 'GET', headers: headers });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const rawError = errorData.error || `HTTP 错误！状态码: ${response.status}`;
                const translatedError = connectionManager.translateError ? connectionManager.translateError(rawError) : rawError;
                throw new Error(translatedError);
            }
            const data = await response.json();

            if (data.success && data.data) {
                this.showResult(data.data);
                historyManager.add({ facode, ip, sn: data.data.asset?.sn });
            } else if (data.success && !data.data) {
                this.showError('未找到该固定资产编码对应的信息');
                historyManager.add({ facode, ip, sn: null });
            } else {
                const rawError = data.error || '查询失败';
                const translatedError = connectionManager.translateError ? connectionManager.translateError(rawError) : rawError;
                throw new Error(translatedError);
            }
        } catch (error) {
            let errorMsg = '查询出错：';
            if (error.message.includes('Failed to fetch')) {
                errorMsg += '无法连接到服务器，请检查 IP 和后端状态';
            } else {
                errorMsg += error.message;
            }
            this.showError(errorMsg);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        if (this.loadingEl) this.loadingEl.classList.remove('hidden');
    }

    hideLoading() {
        if (this.loadingEl) this.loadingEl.classList.add('hidden');
    }

    showResult(data) {
        if (!this.resultBox) return;

        const asset = data.asset;
        const activeBorrow = data.active_borrow;
        const repairs = data.repairs || [];
        const scrapProcess = data.scrap_process;

        const getStatusClass = (status) => `status-${status}`;
        const getStatusText = (status) => {
            const map = {
                'in_use': '使用中',
                'borrowed': '借用中',
                'idle': '闲置',
                'scrap_pending': '待报废',
                'scrapped': '已报废'
            };
            return map[status] || status;
        };

        const resultContent = document.getElementById('resultContent');
        if (resultContent) {
            let html = `
                <div class="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-100 shadow-sm animate-fade-in">
                    <div class="flex items-center justify-between mb-4">
                        <span class="text-sm font-bold text-emerald-600 uppercase tracking-widest">查询结果</span>
                        <span class="status-badge ${getStatusClass(asset.status)}">${getStatusText(asset.status)}</span>
                    </div>
                    <div class="space-y-4">
                        <div class="mb-4">
                            <div class="text-2xl font-bold text-gray-800">${asset.asset_name}</div>
                            <div class="text-sm text-gray-500">${asset.asset_type || '-'}</div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <div class="text-xs text-gray-500 uppercase font-semibold mb-1">固定资产编码</div>
                                <div class="text-lg font-bold text-gray-800 font-mono">${asset.facode}</div>
                            </div>
                            <div>
                                <div class="text-xs text-gray-500 uppercase font-semibold mb-1">序列号 (SN)</div>
                                <div class="text-lg font-extrabold text-emerald-600 font-mono">${asset.sn}</div>
                            </div>
                        </div>
                        <div class="h-px bg-emerald-200"></div>
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <div class="text-gray-500 mb-1">采购日期</div>
                                <div class="font-medium">${asset.purchase_date || '-'}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 mb-1">采购金额</div>
                                <div class="font-medium">¥${Number(asset.purchase_amount || 0).toFixed(2)}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 mb-1">当前净值</div>
                                <div class="font-medium">¥${Number(asset.current_value || 0).toFixed(2)}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 mb-1">维修次数</div>
                                <div class="font-medium">${asset.repair_count || 0} 次</div>
                            </div>
                            <div>
                                <div class="text-gray-500 mb-1">保管人</div>
                                <div class="font-medium">${asset.custodian || '-'}</div>
                            </div>
                            <div>
                                <div class="text-gray-500 mb-1">存放位置</div>
                                <div class="font-medium">${asset.location || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            if (activeBorrow) {
                html += `
                    <div class="mt-4 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-md">
                        <div class="flex">
                            <div class="flex-shrink-0">
                                <svg class="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div class="ml-3">
                                <h4 class="text-sm font-medium text-amber-800">资产借用中</h4>
                                <div class="mt-1 text-sm text-amber-700">
                                    <p>借用人: ${activeBorrow.borrower}</p>
                                    <p>借用日期: ${activeBorrow.borrow_date}</p>
                                    <p>预计归还: ${activeBorrow.expected_return_date || '未指定'}</p>
                                    <p>用途: ${activeBorrow.purpose || '-'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (repairs.length > 0) {
                html += `
                    <div class="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <h4 class="text-sm font-bold text-gray-900 mb-3">维修记录 (最近5次)</h4>
                        <div class="space-y-2">
                            ${repairs.slice(0, 5).map(r => `
                                <div class="flex justify-between items-center text-sm py-2 border-b border-gray-100 last:border-0">
                                    <div>
                                        <span class="font-medium">${r.repair_date}</span>
                                        <span class="text-gray-500 ml-2">${r.repair_type || '-'}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-gray-600">¥${Number(r.repair_cost || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            if (scrapProcess) {
                const statusMap = {
                    'pending_finance': { text: '待财务确认', class: 'bg-yellow-100 text-yellow-800' },
                    'finance_approved': { text: '财务已批准', class: 'bg-blue-100 text-blue-800' },
                    'finance_rejected': { text: '财务已拒绝', class: 'bg-red-100 text-red-800' },
                    'completed': { text: '已完成', class: 'bg-green-100 text-green-800' }
                };
                const status = statusMap[scrapProcess.status] || { text: scrapProcess.status, class: 'bg-gray-100 text-gray-800' };
                
                html += `
                    <div class="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div class="flex justify-between items-center mb-3">
                            <h4 class="text-sm font-bold text-gray-900">报废流程</h4>
                            <span class="status-badge ${status.class}">${status.text}</span>
                        </div>
                        <div class="text-sm space-y-1">
                            <p><span class="text-gray-500">申请人:</span> ${scrapProcess.applicant}</p>
                            <p><span class="text-gray-500">申请日期:</span> ${scrapProcess.apply_date}</p>
                            <p><span class="text-gray-500">报废原因:</span> ${scrapProcess.scrap_reason || '-'}</p>
                            ${scrapProcess.finance_confirm_by ? `<p><span class="text-gray-500">财务确认人:</span> ${scrapProcess.finance_confirm_by}</p>` : ''}
                            ${scrapProcess.finance_confirm_date ? `<p><span class="text-gray-500">财务确认日期:</span> ${scrapProcess.finance_confirm_date}</p>` : ''}
                        </div>
                    </div>
                `;
            }

            if (asset.status !== 'scrapped' && asset.status !== 'scrap_pending') {
                html += `
                    <div class="mt-4">
                        <button onclick="window.scrapManager.initiateScrap('${asset.facode}')" 
                            class="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition font-bold flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            申请报废
                        </button>
                    </div>
                `;
            }

            resultContent.innerHTML = html;
        }
        this.resultBox.classList.remove('hidden');
    }

    hideResult() {
        if (this.resultBox) this.resultBox.classList.add('hidden');
    }

    showError(message) {
        if (!this.errorBox) return;
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) errorMessage.textContent = message;
        this.errorBox.classList.remove('hidden');
    }

    hideError() {
        if (this.errorBox) this.errorBox.classList.add('hidden');
    }
}

// ==================== 初始化 ====================
let connectionManager;
let historyManager;
let queryManager;
let uiManager;
let apiClient;
let tabManager;
let assetManager;
let scrapManager;
let financeManager;
let scanManager;

document.addEventListener('DOMContentLoaded', () => {
    uiManager = new UIManager();
    connectionManager = new ConnectionManager();
    historyManager = new HistoryManager();
    queryManager = new QueryManager();
    
    apiClient = new ApiClient();
    tabManager = new TabManager();
    assetManager = new AssetManager(apiClient);
    scrapManager = new ScrapManager(apiClient);
    financeManager = new FinanceManager(apiClient);
    scanManager = new ScanManager(apiClient);

    // EXPOSE TO WINDOW for inline onclick handlers
    window.connectionManager = connectionManager;
    window.uiManager = uiManager;
    window.queryManager = queryManager;
    window.apiClient = apiClient;
    window.tabManager = tabManager;
    window.assetManager = assetManager;
    window.scrapManager = scrapManager;
    window.financeManager = financeManager;
    window.scanManager = scanManager;
});
