document.addEventListener('DOMContentLoaded', () => {
    // --- VIEWS & ELEMENTS ---
    const clientLoginView = document.getElementById('client-login-view');
    const galleryContainer = document.getElementById('gallery-container');
    const clientLoginForm = document.getElementById('client-login-form');
    const loginMessageArea = document.getElementById('login-message-area');
    const gallery = document.getElementById('photo-gallery');
    const form = document.getElementById('selection-form');
    const successMessage = document.getElementById('success-message');
    const clearBtn = document.getElementById('clear-selection-btn');
    const submissionModal = document.getElementById('submission-modal');
    const stickySubmitBtn = document.getElementById('sticky-submit-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const selectionCountModal = document.getElementById('selection-count-modal');
    const selectionCountBtn = document.getElementById('selection-count-btn');
    const serverStatus = document.getElementById('server-status');
    const photoCount = document.getElementById('photo-count');
    const errorLog = document.getElementById('error-log');
    const lightboxOverlay = document.getElementById('lightbox-overlay');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxNext = document.getElementById('lightbox-next');
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxSelectCheckbox = document.getElementById('lightbox-selection-checkbox');
    const lightboxLoader = document.getElementById('lightbox-loader');
    const lightboxContentWrapper = document.getElementById('lightbox-content-wrapper');
    const lightboxSubmitBtn = document.getElementById('lightbox-submit-btn');
    const lightboxSubmitCount = document.getElementById('lightbox-submit-count');
    const headerSubtitle = document.getElementById('header-subtitle');
    const logoutBtn = document.getElementById('logout-btn');
    const adminDashboardBtn = document.getElementById('admin-dashboard-btn');
    const loadingSentinel = document.getElementById('loading-sentinel');

    let selectedPhotos = new Map();
    let allPhotos = [];
    let currentPhotoIndex = 0;
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let totalPhotosCount = 0;

    const getClientToken = () => localStorage.getItem('clientToken');
    const setClientToken = (token) => localStorage.setItem('clientToken', token);
    const removeClientToken = () => localStorage.removeItem('clientToken');
    const getAuthHeaders = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${getClientToken()}` });

    const showLoginView = (message = null) => {
        removeClientToken();
        galleryContainer.style.display = 'none';
        clientLoginView.style.display = 'flex';
        logoutBtn.style.display = 'none';
        adminDashboardBtn.style.display = 'flex';
        headerSubtitle.textContent = 'Welcome! Please log in to view your private gallery and make your selections.';
        if (message) {
            loginMessageArea.textContent = message;
            loginMessageArea.style.display = 'block';
        }
    };

    const showGalleryView = () => {
        clientLoginView.style.display = 'none';
        galleryContainer.style.display = 'block';
        logoutBtn.style.display = 'block';
        adminDashboardBtn.style.display = 'none';
        headerSubtitle.textContent = 'Welcome! Click the checkmark to select a photo, or click the image itself to open a larger preview.';
        loadSelectionsFromLocalStorage();
        fetchPhotos(1);
    };

    function logout() { showLoginView("You have been successfully logged out."); }
    function saveSelectionsToLocalStorage() { const selectionsArray = Array.from(selectedPhotos.entries()); localStorage.setItem('photoSelections', JSON.stringify(selectionsArray)); }
    function loadSelectionsFromLocalStorage() { const savedSelections = localStorage.getItem('photoSelections'); if (savedSelections) { try { selectedPhotos = new Map(JSON.parse(savedSelections)); } catch (e) { console.error("Could not parse saved selections", e); } } }
    function logError(error) { console.error('Error:', error); errorLog.textContent += error.toString() + '; '; }

    const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    const img = entry.target;
                    const container = img.closest('.photo-container');
                    const loadImage = () => {
                        const loader = container.querySelector('.loader');
                        if (loader) loader.style.display = 'block';
                        img.style.display = 'block';
                        img.onload = () => { img.classList.remove('lazy'); img.classList.add('loaded'); if (container.querySelector('.loader')) container.querySelector('.loader').style.display = 'none'; };
                        img.onerror = () => { logError(`Failed to load thumbnail: ${img.alt}`); if (container.querySelector('.loader')) container.querySelector('.loader').style.display = 'none'; };
                        img.src = img.dataset.src;
                    };
                    loadImage();
                    observer.unobserve(img);
                }, index * 100);
            }
        });
    }, { rootMargin: '0px 0px 200px 0px' });

    async function fetchPhotos(page) {
        if (isLoading || (page > totalPages && page > 1)) return;
        isLoading = true;
        if (page === 1) { gallery.innerHTML = ''; allPhotos = []; currentPage = 1; totalPages = 1; }
        loadingSentinel.style.display = 'block';

        const pathParts = window.location.pathname.split('/');
        const slug = pathParts.pop() || pathParts.pop();

        try {
            serverStatus.textContent = `Server Status: Fetching page ${page}...`;
            const response = await fetch(`/api/my-gallery?slug=${slug}&page=${page}&limit=50`, { headers: getAuthHeaders() });
            if (response.status === 401) return showLoginView("Your session has expired.");
            if (!response.ok) throw new Error(`HTTP ${response.status}: Access denied.`);

            const data = await response.json();
            const { photos: photoData, totalPages: newTotalPages, totalPhotos } = data;
            totalPages = newTotalPages; currentPage = page; totalPhotosCount = totalPhotos;

            if (page === 1) {
                serverStatus.textContent = 'Server Status: ✅ Connected';
                photoCount.textContent = `Photos Found: ${totalPhotosCount}`;
            }
            if (photoData.length === 0 && page === 1) {
                gallery.innerHTML`<div class="error-container"><h3>📁 No Photos Found</h3></div>`;
                return;
            }
            const fragment = document.createDocumentFragment();
            photoData.forEach(photo => {
                const container = document.createElement('div');
                container.className = 'photo-container';
                container.dataset.id = photo.id;
                container.dataset.name = photo.name;
                container.dataset.fullUrl = `/api/image/${photo.id}`;
                container.innerHTML = `<div class="loader"></div><div class="selection-checkbox"></div><img data-src="${photo.url}" alt="${photo.name}" class="lazy">`;
                if (selectedPhotos.has(photo.id)) container.classList.add('selected');
                fragment.appendChild(container);
                lazyLoadObserver.observe(container.querySelector('img'));
            });
            gallery.appendChild(fragment);
            allPhotos = Array.from(document.querySelectorAll('.photo-container'));
        } catch (error) {
            logError(error.message);
            serverStatus.textContent = `Server Status: ❌ Error`;
        } finally {
            isLoading = false;
            loadingSentinel.style.display = (currentPage >= totalPages) ? 'none' : 'block';
        }
    }
    const sentinelObserver = new IntersectionObserver((entries) => { if (entries[0].isIntersecting && !isLoading) fetchPhotos(currentPage + 1); }, { rootMargin: '0px 0px 400px 0px' });
    if (loadingSentinel) sentinelObserver.observe(loadingSentinel);

    function updateSelectionCount() { const count = selectedPhotos.size; selectionCountModal.textContent = count; selectionCountBtn.textContent = count; lightboxSubmitCount.textContent = count; }
    function clearAllSelections() { document.querySelectorAll('.photo-container.selected').forEach(c => c.classList.remove('selected')); selectedPhotos.clear(); saveSelectionsToLocalStorage(); updateSelectionCount(); }
    function toggleSelection(container) { if (!container) return; const photoId = container.dataset.id; const photoName = container.dataset.name; if (selectedPhotos.has(photoId)) { selectedPhotos.delete(photoId); container.classList.remove('selected'); } else { selectedPhotos.set(photoId, { id: photoId, name: photoName }); container.classList.add('selected'); } saveSelectionsToLocalStorage(); updateSelectionCount(); }
    function loadImageInLightbox(index) { if (index < 0 || index >= allPhotos.length) return; currentPhotoIndex = index; const photoContainer = allPhotos[index]; const fullUrl = photoContainer.dataset.fullUrl; const name = photoContainer.dataset.name; lightboxLoader.style.display = 'block'; lightboxContentWrapper.style.visibility = 'hidden'; const tempImg = new Image(); tempImg.onload = () => { lightboxImg.src = fullUrl; lightboxCaption.textContent = name; lightboxSelectCheckbox.classList.toggle('selected', photoContainer.classList.contains('selected')); lightboxLoader.style.display = 'none'; lightboxContentWrapper.style.visibility = 'visible'; }; tempImg.onerror = () => { logError(`Failed to load high-res image: ${name}`); lightboxLoader.style.display = 'none'; lightboxContentWrapper.style.visibility = 'visible'; lightboxImg.src = ''; lightboxCaption.textContent = `Error loading image: ${name}`; }; tempImg.src = fullUrl; }
    function openLightbox(index) { lightboxOverlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; loadImageInLightbox(index); }
    function closeLightbox() { lightboxOverlay.style.display = 'none'; lightboxImg.src = ""; document.body.style.overflow = 'auto'; }

    logoutBtn.addEventListener('click', logout);
    clientLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginMessageArea.style.display = 'none';
        const username = document.getElementById('client-username').value;
        const password = document.getElementById('client-password').value;
        const pathParts = window.location.pathname.split('/');
        const slug = pathParts.pop() || pathParts.pop();
        try {
            const response = await fetch('/api/client-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, slug }) });
            const data = await response.json();
            if (data.token) { setClientToken(data.token); showGalleryView(); } else { showLoginView(data.message || "Login failed."); }
        } catch (error) { showLoginView("An error occurred. Please try again."); }
    });
    gallery.addEventListener('click', (event) => { const container = event.target.closest('.photo-container'); if (!container) return; if (event.target.classList.contains('selection-checkbox')) { toggleSelection(container); return; } const index = allPhotos.indexOf(container); if (index > -1) openLightbox(index); });
    clearBtn.addEventListener('click', () => { if (window.confirm("Are you sure you want to clear all selected photos?")) { clearAllSelections(); } });
    stickySubmitBtn.addEventListener('click', () => { if (selectedPhotos.size === 0) { alert('Please select at least one photo.'); return; } submissionModal.style.display = 'flex'; });
    closeModalBtn.addEventListener('click', () => { submissionModal.style.display = 'none'; });
    submissionModal.addEventListener('click', (event) => { if (event.target === submissionModal) submissionModal.style.display = 'none'; });
    lightboxClose.addEventListener('click', closeLightbox);
    lightboxNext.addEventListener('click', () => loadImageInLightbox((currentPhotoIndex + 1) % allPhotos.length));
    lightboxPrev.addEventListener('click', () => loadImageInLightbox((currentPhotoIndex - 1 + allPhotos.length) % allPhotos.length));
    lightboxOverlay.addEventListener('click', (event) => { if (event.target === lightboxOverlay) closeLightbox(); });
    lightboxSelectCheckbox.addEventListener('click', () => { const container = allPhotos[currentPhotoIndex]; toggleSelection(container); lightboxSelectCheckbox.classList.toggle('selected'); });
    lightboxSubmitBtn.addEventListener('click', () => { if (selectedPhotos.size === 0) { alert('Please select at least one photo.'); return; } closeLightbox(); submissionModal.style.display = 'flex'; });
    document.addEventListener('keydown', (event) => { if (lightboxOverlay.style.display === 'flex') { if (event.key === 'Escape') closeLightbox(); if (event.key === 'ArrowRight') lightboxNext.click(); if (event.key === 'ArrowLeft') lightboxPrev.click(); } });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const clientName = document.getElementById('client-name').value.trim();
        const clientEmail = document.getElementById('client-email').value.trim();
        const clientPhone = document.getElementById('client-phone').value.trim();
        const selections = Array.from(selectedPhotos.values());
        if (selections.length === 0 || !clientName || !clientEmail || !clientPhone) { alert('Please fill in all required client details.'); return; }
        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        try {
            const response = await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientName, clientEmail, clientPhone, selectedPhotos: selections }), });
            if (response.ok) {
                form.style.display = 'none';
                successMessage.style.display = 'flex';
                localStorage.removeItem('photoSelections');
                clearAllSelections();
                setTimeout(() => {
                    submissionModal.style.display = 'none';
                    successMessage.style.display = 'none';
                    form.style.display = 'block';
                    form.reset();
                    submitBtn.textContent = 'Submit Selections';
                    submitBtn.disabled = false;
                }, 4000);
            } else { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`); }
        } catch (error) { logError(`Submission failed: ${error.message}`); alert(`There was an error submitting your selections: ${error.message}`); submitBtn.textContent = 'Submit Selections'; submitBtn.disabled = false; }
    });

    // --- Initial Page Load ---
    // Always show the login view first. Do not automatically log in.
    showLoginView();
});