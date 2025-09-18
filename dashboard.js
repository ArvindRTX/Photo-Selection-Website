document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let allGalleries = [], allClients = [], allContacts = [], itemToDelete = { type: null, id: null };

    // --- ELEMENT SELECTORS ---
    const loginView = document.getElementById('login-view'), dashboardContent = document.getElementById('dashboard-content'), loginForm = document.getElementById('login-form'), logoutBtn = document.getElementById('logout-btn'), adminWelcome = document.getElementById('admin-welcome'), totalGalleriesEl = document.getElementById('total-galleries'), totalClientsEl = document.getElementById('total-clients'), totalSelectionsEl = document.getElementById('total-selections'), createGalleryForm = document.getElementById('create-gallery-form'), galleryList = document.getElementById('gallery-list'), gallerySearch = document.getElementById('gallery-search'), clientSelect = document.getElementById('client-select'), createClientForm = document.getElementById('create-client-form'), clientList = document.getElementById('client-list'), clientSearch = document.getElementById('client-search'), contactList = document.getElementById('contact-list'), contactSearch = document.getElementById('contact-search'), toastContainer = document.getElementById('toast-container');
    const confirmModal = document.getElementById('confirm-modal'), confirmMessage = document.getElementById('confirm-message'), confirmYes = document.getElementById('confirm-yes'), confirmNo = document.getElementById('confirm-no'), editClientModal = document.getElementById('edit-client-modal'), editClientForm = document.getElementById('edit-client-form'), assignGalleryModal = document.getElementById('assign-gallery-modal'), assignGalleryForm = document.getElementById('assign-gallery-form');
    
    // --- HELPERS ---
    const getToken = () => localStorage.getItem('adminToken');
    const getAuthHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` });
    const showToast = (message, type = 'success') => { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-times-circle'}"></i><p>${message}</p>`; toastContainer.appendChild(toast); setTimeout(() => toast.remove(), 5000) };
    const showModal = (id) => document.getElementById(id).classList.add('show');
    const hideModal = (id) => document.getElementById(id).classList.remove('show');

    // --- RENDER FUNCTIONS ---
    const renderGalleries = (galleries) => { galleryList.innerHTML = galleries.length === 0 ? '<p>No galleries found.</p>' : galleries.map(g => `<div class="item"><div class="item-info"><div><i class="fas fa-images fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${g.name}</strong></p><a href="${window.location.origin}/gallery/${g.slug}" target="_blank">View Gallery</a></div></div><button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="gallery" data-id="${g._id}"><i class="fas fa-trash-alt"></i></button></div>`).join('') };
    const renderClients = (clients) => { clientList.innerHTML = ''; clientSelect.innerHTML = '<option value="">-- No Client --</option>'; if(clients.length === 0){ clientList.innerHTML = '<p>No clients found.</p>'; return; } clients.forEach(c => { const clientItem = document.createElement('div'); clientItem.className = 'item'; clientItem.innerHTML = `<div class="item-info"><div><i class="fas fa-user fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${c.name}</strong></p><p style="font-size:0.9rem; color:#666;">Galleries: ${c.galleryIds?.length || 0}</p></div></div><div class="actions-cell"><button class="actions-btn" data-action="toggle-dropdown" data-id="${c._id}"><i class="fas fa-ellipsis-v"></i></button><div class="dropdown-menu" data-menu-for="${c._id}"><button class="dropdown-item" data-action="view-client" data-id="${c._id}"><i class="fas fa-eye"></i> View Details</button><button class="dropdown-item" data-action="edit-client" data-id="${c._id}"><i class="fas fa-edit"></i> Edit Credentials</button><button class="dropdown-item" data-action="assign-gallery" data-id="${c._id}"><i class="fas fa-images"></i> Assign Galleries</button><div class="dropdown-divider"></div><button class="dropdown-item" data-action="confirm-delete" data-type="client" data-id="${c._id}"><i class="fas fa-trash-alt"></i> Delete Client</button></div></div>`; clientList.appendChild(clientItem); clientSelect.innerHTML += `<option value="${c._id}">${c.name} (${c.username})</option>`; }) };
    const renderContacts = (contacts) => { contactList.innerHTML = contacts.length === 0 ? '<p>No contacts found.</p>' : contacts.map(c => `<div class="item"><div class="item-info"><div><i class="fas fa-address-card fa-lg" style="color:#c0a062;"></i></div><div><p><strong>${c.name}</strong></p><p style="font-size:0.9rem; color:#666;">${c.email} | ${c.phone}</p></div></div><button class="btn btn-danger btn-small" data-action="confirm-delete" data-type="contact" data-id="${c._id}"><i class="fas fa-trash-alt"></i></button></div>`).join('') };
    const updateStats = (g, c, s) => { totalGalleriesEl.textContent = g.length; totalClientsEl.textContent = c.length; totalSelectionsEl.textContent = s.reduce((sum, sub) => sum + (sub.selectedPhotos?.length || 0), 0) };
    
    // --- API & DATA ---
    const fetchData = async () => {
        try {
            const [gRes, cRes, sRes, contactsRes] = await Promise.all([fetch('/api/galleries', { headers: getAuthHeaders() }), fetch('/api/clients', { headers: getAuthHeaders() }), fetch('/api/submissions', { headers: getAuthHeaders() }), fetch('/api/contacts', { headers: getAuthHeaders() })]);
            if (gRes.status === 401) return logout();
            allGalleries = await gRes.json(); allClients = await cRes.json(); const submissions = await sRes.json(); allContacts = await contactsRes.json();
            renderGalleries(allGalleries); renderClients(allClients); renderContacts(allContacts); updateStats(allGalleries, allClients, submissions);
        } catch (error) { showToast('Failed to load dashboard data.', 'error'); }
    };

    // --- EVENT HANDLERS ---
    const handleSearch = (e) => {
        const term = e.target.value.toLowerCase();
        if (e.target.id === 'gallery-search') renderGalleries(allGalleries.filter(g => g.name.toLowerCase().includes(term)));
        else if (e.target.id === 'client-search') renderClients(allClients.filter(c => c.name.toLowerCase().includes(term) || c.username.toLowerCase().includes(term)));
        else if (e.target.id === 'contact-search') renderContacts(allContacts.filter(c => c.name.toLowerCase().includes(term) || c.email.toLowerCase().includes(term)));
    };
    
    // --- MODAL LOGIC ---
    const openViewClientModal = (clientId) => { const client = allClients.find(c => c._id === clientId); if(!client) return; document.getElementById('view-client-name').textContent = client.name; document.getElementById('view-client-username').textContent = client.username; const galleryUList = document.getElementById('view-client-galleries'); const assignedGalleries = allGalleries.filter(g => client.galleryIds.includes(g._id)); galleryUList.innerHTML = assignedGalleries.length > 0 ? assignedGalleries.map(g => `<li>${g.name}</li>`).join('') : '<li>No galleries assigned.</li>'; showModal('view-client-modal'); };
    const openAssignGalleryModal = (clientId) => { const client = allClients.find(c => c._id === clientId); if (!client) return; document.getElementById('assign-client-id').value = client._id; document.getElementById('assign-gallery-title').textContent = `Assign Galleries for ${client.name}`; const listEl = document.getElementById('assign-gallery-list'); listEl.innerHTML = allGalleries.map(g => `<label class="gallery-checkbox-item"><input type="checkbox" value="${g._id}" ${client.galleryIds?.includes(g._id) ? 'checked' : ''}>${g.name}</label>`).join(''); showModal('assign-gallery-modal'); };
    const handleAssignGallery = async (e) => { e.preventDefault(); const clientId = e.target['assign-client-id'].value; const selectedIds = Array.from(e.target.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value); try { const res = await fetch(`/api/clients/${clientId}/galleries`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ galleryIds: selectedIds }) }); const data = await res.json(); if (res.ok) { showToast('Assignments updated.', 'success'); hideModal('assign-gallery-modal'); fetchData() } else { showToast(data.message, 'error') } } catch (err) { showToast('Failed to update assignments.', 'error'); } };
    const openEditClientModal = (clientId) => { const client = allClients.find(c => c._id === clientId); if (!client) return; document.getElementById('edit-client-id').value = client._id; document.getElementById('edit-client-name').value = client.name; document.getElementById('edit-client-username').value = client.username; document.getElementById('edit-client-password').value = ''; showModal('edit-client-modal') };
    const handleConfirmDeletion = async () => { const { type, id } = itemToDelete; if (!type || !id) return; const endpointMap = { gallery: 'galleries', client: 'clients', contact: 'contacts' }; const endpoint = endpointMap[type]; if (!endpoint) return; try { const res = await fetch(`/api/${endpoint}/${id}`, { method: 'DELETE', headers: getAuthHeaders() }); const data = await res.json(); if (res.ok) { showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted.`, 'success'); fetchData() } else { showToast(data.message || `Failed to delete ${type}.`, 'error') } } catch (err) { showToast(`Failed to delete ${type}.`, 'error') } finally { hideModal('confirm-modal'); itemToDelete = { type: null, id: null } } };
    
    // --- INITIALIZATION ---
    const showDashboard = () => { loginView.style.display = 'none'; dashboardContent.style.display = 'block'; adminWelcome.textContent = `Welcome, ${localStorage.getItem('adminUsername') || 'Admin'}`; fetchData() };
    const logout = () => { localStorage.removeItem('adminToken'); localStorage.removeItem('adminUsername'); window.location.reload() };

    // --- GLOBAL EVENT LISTENER ---
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) { // If click is not on an action, hide any open global dropdowns
            document.querySelectorAll('.dropdown-menu-global').forEach(m => m.remove());
            return;
        }
        const { action, id, type } = target.dataset;

        if (action === 'toggle-dropdown') {
            // Close any existing global menu
            const existingMenu = document.querySelector('.dropdown-menu-global');
            if (existingMenu) {
                existingMenu.remove();
                // If clicking the same button, just close it and stop.
                if (existingMenu.dataset.owner === id) return;
            }

            const originalMenu = document.querySelector(`.dropdown-menu[data-menu-for="${id}"]`);
            if (!originalMenu) return;

            const clonedMenu = originalMenu.cloneNode(true);
            clonedMenu.classList.add('dropdown-menu-global', 'show');
            clonedMenu.dataset.owner = id;
            document.body.appendChild(clonedMenu);
            
            const btnRect = target.getBoundingClientRect();
            const menuRect = clonedMenu.getBoundingClientRect();
            
            let top = btnRect.bottom;
            if (btnRect.bottom + menuRect.height > window.innerHeight) {
                top = btnRect.top - menuRect.height;
            }

            clonedMenu.style.position = 'fixed';
            clonedMenu.style.top = `${top}px`;
            clonedMenu.style.right = `${window.innerWidth - btnRect.right}px`;
        } else {
            // Any other action should close the global menu
             document.querySelectorAll('.dropdown-menu-global').forEach(m => m.remove());
        }

        if (action === 'confirm-delete') { itemToDelete = { type, id }; confirmMessage.textContent = `Are you sure you want to delete this ${type}?`; showModal('confirm-modal'); }
        if (action === 'view-client') openViewClientModal(id);
        if (action === 'edit-client') openEditClientModal(id);
        if (action === 'assign-gallery') openAssignGalleryModal(id);
    });

    loginForm.addEventListener('submit', async (e) => { e.preventDefault(); try { const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }) }); const data = await res.json(); if (data.token) { localStorage.setItem('adminToken', data.token); localStorage.setItem('adminUsername', data.username); showDashboard() } else { showToast(data.message || 'Login failed', 'error') } } catch (error) { showToast('An error occurred during login.', 'error') } });
    createGalleryForm.addEventListener('submit', async(e) => { e.preventDefault(); const body = { name: e.target['gallery-name'].value, folderLink: e.target['folder-link'].value, clientId: e.target['client-select'].value }; try { const res = await fetch('/api/galleries', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) }); const data = await res.json(); if (res.ok) { showToast('Gallery created!', 'success'); e.target.reset(); fetchData() } else { showToast(data.message, 'error') } } catch (err) { showToast('Failed to create gallery.', 'error') } });
    createClientForm.addEventListener('submit', async(e) => { e.preventDefault(); const body = { name: e.target['client-name'].value, username: e.target['client-username'].value, password: e.target['client-password'].value }; try { const res = await fetch('/api/clients', { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) }); const data = await res.json(); if (res.ok) { showToast('Client created!', 'success'); e.target.reset(); fetchData() } else { showToast(data.message, 'error') } } catch (err) { showToast('Failed to create client.', 'error') } });
    editClientForm.addEventListener('submit', async(e) => { e.preventDefault(); const id = e.target['edit-client-id'].value; const body = { name: e.target['edit-client-name'].value, username: e.target['edit-client-username'].value, password: e.target['edit-client-password'].value, }; if (!body.password) delete body.password; try { const res = await fetch(`/api/clients/${id}`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(body) }); const data = await res.json(); if (res.ok) { showToast('Client updated.', 'success'); hideModal('edit-client-modal'); fetchData() } else { showToast(data.message, 'error') } } catch (err) { showToast('Failed to update client.', 'error') } });
    
    logoutBtn.addEventListener('click', logout);
    gallerySearch.addEventListener('keyup', handleSearch);
    clientSearch.addEventListener('keyup', handleSearch);
    contactSearch.addEventListener('keyup', handleSearch);
    confirmYes.addEventListener('click', handleConfirmDeletion);
    confirmNo.addEventListener('click', () => hideModal('confirm-modal'));
    assignGalleryForm.addEventListener('submit', handleAssignGallery);

    document.querySelectorAll('.modal .close-btn').forEach(btn => btn.addEventListener('click', () => hideModal(btn.dataset.modalId)));

    if (getToken()) { showDashboard(); }
});