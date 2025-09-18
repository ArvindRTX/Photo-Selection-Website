document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const loginView = document.getElementById('login-view');
    const dashboardContent = document.getElementById('dashboard-content');
    const messageArea = document.getElementById('message-area');
    const galleryList = document.getElementById('gallery-list');
    const clientList = document.getElementById('client-list');
    const loginForm = document.getElementById('login-form');
    const createGalleryForm = document.getElementById('create-gallery-form');
    const createClientForm = document.getElementById('create-client-form');
    const clientSelect = document.getElementById('client-select');
    
    // Search elements
    const gallerySearch = document.getElementById('gallery-search');
    const clientSearch = document.getElementById('client-search');
    
    // Stat elements
    const totalGalleries = document.getElementById('total-galleries');
    const totalClients = document.getElementById('total-clients');
    const totalPhotos = document.getElementById('total-photos');
    const totalSelections = document.getElementById('total-selections');

    // Storage for data
    let galleries = [];
    let clients = [];
    
    // Helper Functions
    const getToken = () => localStorage.getItem('token');
    
    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    });

    const showMessage = (text, type = 'error') => {
        messageArea.textContent = text;
        messageArea.className = `message ${type}`;
        messageArea.style.display = 'flex';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            messageArea.style.display = 'none';
        }, 5000);
    };

    const showLoading = (element) => {
        element.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
            </div>
        `;
    };

    const animateValue = (element, start, end, duration) => {
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
                element.textContent = end;
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current);
            }
        }, 16);
    };

    const updateStats = () => {
        // Animate stat counters
        animateValue(totalGalleries, 0, galleries.length, 1000);
        animateValue(totalClients, 0, clients.length, 1000);
        
        // Calculate total photos and selections
        let photoCount = 0;
        let selectionCount = 0;
        
        galleries.forEach(gallery => {
            if (gallery.photoCount) photoCount += gallery.photoCount;
            if (gallery.selectionCount) selectionCount += gallery.selectionCount;
        });
        
        animateValue(totalPhotos, 0, photoCount, 1500);
        animateValue(totalSelections, 0, selectionCount, 1200);
    };

    const showDashboard = () => {
        loginView.style.display = 'none';
        dashboardContent.style.display = 'block';
        fetchGalleries();
        fetchClients();
    };

    // API Functions with enhanced error handling
    const fetchClients = async () => {
        try {
            showLoading(clientList);
            const response = await fetch('/api/clients', {
                headers: getAuthHeaders()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Could not fetch clients.`);
            }
            
            clients = await response.json();
            renderClients();
            updateClientSelect();
            updateStats();
        } catch (error) {
            clientList.innerHTML = `
                <div class="message error">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${error.message}
                </div>
            `;
        }
    };

    const fetchGalleries = async () => {
        try {
            showLoading(galleryList);
            const response = await fetch('/api/galleries', {
                headers: getAuthHeaders()
            });
            
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.reload();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Could not fetch galleries.`);
            }
            
            galleries = await response.json();
            renderGalleries();
            updateStats();
        } catch (error) {
            galleryList.innerHTML = `
                <div class="message error">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${error.message}
                </div>
            `;
        }
    };

    // Render Functions
    const renderClients = (filteredClients = clients) => {
        if (filteredClients.length === 0) {
            clientList.innerHTML = `
                <div class="message" style="display: flex;">
                    <i class="fas fa-users"></i>
                    No clients found.
                </div>
            `;
            return;
        }

        clientList.innerHTML = filteredClients.map(client => `
            <div class="item" data-client-id="${client._id}">
                <div class="item-info">
                    <h4>${client.name}</h4>
                    <p><i class="fas fa-user"></i> ${client.username}</p>
                    <p><i class="fas fa-envelope"></i> ${client.email}</p>
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary btn-small edit-client-btn" data-id="${client._id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-danger btn-small delete-client-btn" data-id="${client._id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    };

    const renderGalleries = (filteredGalleries = galleries) => {
        if (filteredGalleries.length === 0) {
            galleryList.innerHTML = `
                <div class="message" style="display: flex;">
                    <i class="fas fa-images"></i>
                    No galleries found.
                </div>
            `;
            return;
        }

        galleryList.innerHTML = filteredGalleries.map(gallery => {
            const clientName = clients.find(c => c._id === gallery.clientId)?.name || 'Unassigned';
            const galleryLink = `${window.location.origin}/gallery/${gallery.slug}`;
            
            return `
                <div class="item" data-gallery-id="${gallery._id}">
                    <div class="item-info">
                        <h4>${gallery.name}</h4>
                        <p><i class="fas fa-user"></i> ${clientName}</p>
                        <p><i class="fas fa-images"></i> ${gallery.photoCount || 0} photos</p>
                        <p><i class="fas fa-check-circle"></i> ${gallery.selectionCount || 0} selections</p>
                    </div>
                    <div class="item-actions">
                        <a href="${galleryLink}" target="_blank" class="btn btn-secondary btn-small">
                            <i class="fas fa-external-link-alt"></i> View
                        </a>
                        <button class="btn btn-danger btn-small delete-gallery-btn" data-id="${gallery._id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    const updateClientSelect = () => {
        clientSelect.innerHTML = '<option value="">-- No Client --</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client._id;
            option.textContent = `${client.name} (${client.username})`;
            clientSelect.appendChild(option);
        });
    };

    // Search functionality
    const setupSearch = () => {
        gallerySearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = galleries.filter(gallery => 
                gallery.name.toLowerCase().includes(query) ||
                (clients.find(c => c._id === gallery.clientId)?.name || '').toLowerCase().includes(query)
            );
            renderGalleries(filtered);
        });

        clientSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = clients.filter(client =>
                client.name.toLowerCase().includes(query) ||
                client.username.toLowerCase().includes(query) ||
                client.email.toLowerCase().includes(query)
            );
            renderClients(filtered);
        });
    };

    // Event Listeners
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.token) {
                localStorage.setItem('token', data.token);
                showMessage('Login successful!', 'success');
                setTimeout(showDashboard, 1000);
            } else {
                showMessage(data.message || 'Login failed.');
            }
        } catch (error) {
            showMessage('Login request failed. Please try again.');
        }
    });

    createGalleryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('gallery-name').value;
        const folderLink = document.getElementById('folder-link').value;
        const clientId = clientSelect.value;
        
        try {
            const response = await fetch('/api/galleries', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, folderLink, clientId })
            });
            
            if (response.ok) {
                createGalleryForm.reset();
                showMessage('Gallery created successfully!', 'success');
                fetchGalleries();
            } else {
                const error = await response.json();
                showMessage(error.message || 'Could not create gallery.');
            }
        } catch (error) {
            showMessage('Could not create gallery. Please try again.');
        }
    });

    createClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('client-name').value;
        const email = document.getElementById('client-email').value;
        const username = document.getElementById('client-username').value;
        const password = document.getElementById('client-password').value;
        
        try {
            const response = await fetch('/api/clients', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, email, username, password })
            });
            
            if (response.ok) {
                createClientForm.reset();
                showMessage('Client created successfully!', 'success');
                fetchClients();
            } else {
                const error = await response.json();
                showMessage(error.message || 'Could not create client.');
            }
        } catch (error) {
            showMessage('Could not create client. Please try again.');
        }
    });

    // Delete handlers
    document.addEventListener('click', async (e) => {
        if (e.target.closest('.delete-gallery-btn')) {
            const id = e.target.closest('.delete-gallery-btn').dataset.id;
            if (confirm('Delete this gallery? This action cannot be undone.')) {
                try {
                    const response = await fetch(`/api/galleries/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    
                    if (response.ok) {
                        showMessage('Gallery deleted successfully!', 'success');
                        fetchGalleries();
                    } else {
                        showMessage('Could not delete gallery.');
                    }
                } catch (error) {
                    showMessage('Delete request failed.');
                }
            }
        }
        
        if (e.target.closest('.delete-client-btn')) {
            const id = e.target.closest('.delete-client-btn').dataset.id;
            if (confirm('Delete this client? This will also unassign them from any galleries.')) {
                try {
                    const response = await fetch(`/api/clients/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    
                    if (response.ok) {
                        showMessage('Client deleted successfully!', 'success');
                        fetchClients();
                        fetchGalleries(); // Refresh galleries to update client assignments
                    } else {
                        showMessage('Could not delete client.');
                    }
                } catch (error) {
                    showMessage('Delete request failed.');
                }
            }
        }
    });

    // Logout function
    window.logout = () => {
        localStorage.removeItem('token');
        window.location.reload();
    };

    // Initialize
    setupSearch();
    
    if (getToken()) {
        showDashboard();
    }
});
