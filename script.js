document.addEventListener('DOMContentLoaded', () => {
    // Gallery and Form Elements
    const gallery = document.getElementById('photo-gallery');
    const form = document.getElementById('selection-form');
    const successMessage = document.getElementById('success-message');
    const clearBtn = document.getElementById('clear-selection-btn');
    
    // Modal Elements
    const submissionModal = document.getElementById('submission-modal');
    const stickySubmitBtn = document.getElementById('sticky-submit-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    // Selection Count Displays
    const selectionCountModal = document.getElementById('selection-count-modal');
    const selectionCountBtn = document.getElementById('selection-count-btn');
    
    // Debug elements
    const serverStatus = document.getElementById('server-status');
    const photoCount = document.getElementById('photo-count');
    const errorLog = document.getElementById('error-log');
    
    // Lightbox Elements
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

    let selectedPhotos = new Map();
    let debugErrors = [];
    let allPhotos = [];
    let currentPhotoIndex = 0;

    // --- LOCAL STORAGE FUNCTIONS ---
    function saveSelectionsToLocalStorage() {
        const selectionsArray = Array.from(selectedPhotos.entries());
        localStorage.setItem('photoSelections', JSON.stringify(selectionsArray));
    }

    function loadSelectionsFromLocalStorage() {
        const savedSelections = localStorage.getItem('photoSelections');
        if (savedSelections) {
            try {
                const selectionsArray = JSON.parse(savedSelections);
                selectedPhotos = new Map(selectionsArray);
            } catch (e) {
                console.error("Could not parse saved selections", e);
                localStorage.removeItem('photoSelections');
            }
        }
    }

    // Debug functions
    function updateDebugInfo() {
        errorLog.textContent = debugErrors.length > 0 ? debugErrors.join(', ') : 'None';
    }

    function logError(error) {
        console.error('Error:', error);
        debugErrors.push(error.toString());
        updateDebugInfo();
    }
    
    // --- LAZY LOADING with Intersection Observer ---
    const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const container = img.closest('.photo-container');
                const loader = container.querySelector('.loader');

                img.onload = () => {
                    img.classList.remove('lazy');
                    img.classList.add('loaded');
                    if (loader) loader.style.display = 'none';
                };

                img.onerror = () => {
                    if (loader) loader.style.display = 'none';
                    logError(`Failed to load thumbnail: ${img.alt}`);
                    container.classList.add('error');
                    
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message';
                    errorDiv.innerHTML = `<strong>Image Load Failed</strong><br>${img.alt}`;
                    
                    const checkbox = container.querySelector('.selection-checkbox');
                    if(checkbox) checkbox.remove();
                    img.remove();
                    container.appendChild(errorDiv);
                };

                img.src = img.dataset.src;
                observer.unobserve(img);
            }
        });
    }, {
        rootMargin: '0px 0px 200px 0px'
    });

    // Test server connectivity using a relative path
    async function testServerConnection() {
        try {
            serverStatus.textContent = 'Server Status: Testing connection...';
            // CHANGED: Use relative path
            const response = await fetch('/get-photos'); 
            
            if (response.ok) {
                serverStatus.textContent = 'Server Status: ✅ Connected';
                return true;
            } else {
                serverStatus.textContent = `Server Status: ❌ Error ${response.status}`;
                logError(`Server responded with status: ${response.status}`);
                return false;
            }
        } catch (error) {
            serverStatus.textContent = 'Server Status: ❌ Not reachable';
            logError(`Cannot reach server: ${error.message}`);
            return false;
        }
    }
    
    function showSkeletonLoaders() {
        let skeletonHTML = '';
        for (let i = 0; i < 12; i++) {
            skeletonHTML += '<div class="photo-container-skeleton"></div>';
        }
        gallery.innerHTML = skeletonHTML;
    }

    async function loadPhotosFromServer() {
        showSkeletonLoaders();
        
        try {
            const serverConnected = await testServerConnection();
            
            if (!serverConnected) {
                gallery.innerHTML = `<div class="error-container"><h3>🔌 Server Connection Failed</h3><p>Please make sure your Node.js server is running and accessible.</p><code>node server.js</code><button onclick="location.reload()" class="retry-btn">Try Again</button></div>`;
                return;
            }

            // CHANGED: Use relative path
            const response = await fetch('/get-photos');
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            const photoData = await response.json();
            photoCount.textContent = `Photos Found: ${photoData.length}`;

            if (!photoData || photoData.length === 0) {
                gallery.innerHTML = `<div class="error-container"><h3>📁 No Photos Found</h3><p>No images were found in your Google Drive folder. Check your folder ID and permissions.</p></div>`;
                return;
            }
            
            gallery.innerHTML = '';
            const fragment = document.createDocumentFragment();

            photoData.forEach(photo => {
                const container = document.createElement('div');
                container.className = 'photo-container';
                container.dataset.id = photo.id;
                container.dataset.name = photo.name;
                container.dataset.fullUrl = `https://drive.google.com/thumbnail?id=${photo.id}&sz=w1920`;

                const loader = document.createElement('div');
                loader.className = 'loader';
                container.appendChild(loader);

                const checkbox = document.createElement('div');
                checkbox.className = 'selection-checkbox';
                container.appendChild(checkbox);

                const img = document.createElement('img');
                img.dataset.src = photo.url;
                img.alt = photo.name;
                img.className = 'lazy';
                
                container.appendChild(img);
                fragment.appendChild(container);
                
                lazyLoadObserver.observe(img);
            });

            gallery.appendChild(fragment);
            allPhotos = Array.from(document.querySelectorAll('.photo-container'));
            
            allPhotos.forEach(container => {
                if(selectedPhotos.has(container.dataset.id)) {
                    container.classList.add('selected');
                }
            });
            updateSelectionCount();

        } catch (error) {
            logError(`Failed to load photos: ${error.message}`);
            gallery.innerHTML = `<div class="error-container"><h3>❌ Error Loading Photos</h3><p>Error: ${error.message}</p><p>Check the browser console and server logs for more details.</p><button onclick="location.reload()" class="retry-btn">Try Again</button></div>`;
        }
    }

    function updateSelectionCount() {
        const count = selectedPhotos.size;
        selectionCountModal.textContent = count;
        selectionCountBtn.textContent = count;
        lightboxSubmitCount.textContent = count;
    }

    function clearAllSelections() {
        document.querySelectorAll('.photo-container.selected').forEach(container => {
            container.classList.remove('selected');
        });
        selectedPhotos.clear();
        saveSelectionsToLocalStorage();
        updateSelectionCount();
    }

    function toggleSelection(container) {
        if (!container || container.classList.contains('error')) return;

        const photoId = container.dataset.id;
        const photoName = container.dataset.name;

        if (selectedPhotos.has(photoId)) {
            selectedPhotos.delete(photoId);
            container.classList.remove('selected');
        } else {
            selectedPhotos.set(photoId, { id: photoId, name: photoName });
            container.classList.add('selected');
        }
        saveSelectionsToLocalStorage();
        updateSelectionCount();
    }

    function loadImageInLightbox(index) {
        if (index < 0 || index >= allPhotos.length) return;
        currentPhotoIndex = index;
        const photoContainer = allPhotos[index];
        if (photoContainer.classList.contains('error')) return;

        const fullUrl = photoContainer.dataset.fullUrl;
        const name = photoContainer.dataset.name;

        lightboxLoader.style.display = 'block';
        lightboxContentWrapper.style.visibility = 'hidden';

        const tempImg = new Image();
        tempImg.onload = () => {
            lightboxImg.src = fullUrl;
            lightboxCaption.textContent = name;
            lightboxSelectCheckbox.classList.toggle('selected', photoContainer.classList.contains('selected'));
            lightboxLoader.style.display = 'none';
            lightboxContentWrapper.style.visibility = 'visible';
        };
        tempImg.onerror = () => {
            logError(`Failed to load high-res image: ${name}`);
            lightboxLoader.style.display = 'none';
            lightboxContentWrapper.style.visibility = 'visible';
            lightboxImg.src = '';
            lightboxCaption.textContent = `Error loading image: ${name}`;
        };
        tempImg.src = fullUrl;
    }

    function openLightbox(index) {
        lightboxOverlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        loadImageInLightbox(index);
    }

    function closeLightbox() {
        lightboxOverlay.style.display = 'none';
        lightboxImg.src = "";
        document.body.style.overflow = 'auto';
    }
    
    gallery.addEventListener('click', (event) => {
        const target = event.target;
        const container = target.closest('.photo-container');
        if (!container) return;
        if (target.classList.contains('selection-checkbox')) {
            toggleSelection(container);
            return;
        }
        const index = allPhotos.indexOf(container);
        if (index > -1) openLightbox(index);
    });

    clearBtn.addEventListener('click', () => {
        if (window.confirm("Are you sure you want to clear all selected photos? This cannot be undone.")) {
            clearAllSelections();
            submissionModal.style.display = 'none';
        }
    });
    
    stickySubmitBtn.addEventListener('click', () => {
        if (selectedPhotos.size === 0) {
            alert('Please select at least one photo before submitting.');
            return;
        }
        submissionModal.style.display = 'flex';
    });

    closeModalBtn.addEventListener('click', () => {
        submissionModal.style.display = 'none';
    });

    submissionModal.addEventListener('click', (event) => {
        if (event.target === submissionModal) submissionModal.style.display = 'none';
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightboxNext.addEventListener('click', () => loadImageInLightbox((currentPhotoIndex + 1) % allPhotos.length));
    lightboxPrev.addEventListener('click', () => loadImageInLightbox((currentPhotoIndex - 1 + allPhotos.length) % allPhotos.length));

    lightboxSelectCheckbox.addEventListener('click', () => {
        const container = allPhotos[currentPhotoIndex];
        toggleSelection(container);
        lightboxSelectCheckbox.classList.toggle('selected');
    });

    lightboxSubmitBtn.addEventListener('click', () => {
        if (selectedPhotos.size === 0) {
            alert('Please select at least one photo before submitting.');
            return;
        }
        closeLightbox();
        submissionModal.style.display = 'flex';
    });

    lightboxOverlay.addEventListener('click', (event) => {
        if (event.target === lightboxOverlay) closeLightbox();
    });

    document.addEventListener('keydown', (event) => {
        if (lightboxOverlay.style.display === 'flex') {
            if (event.key === 'Escape') closeLightbox();
            if (event.key === 'ArrowRight') lightboxNext.click();
            if (event.key === 'ArrowLeft') lightboxPrev.click();
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const clientName = document.getElementById('client-name').value.trim();
        const clientEmail = document.getElementById('client-email').value.trim();
        const clientPhone = document.getElementById('client-phone').value.trim();
        const selections = Array.from(selectedPhotos.values());

        if (selections.length === 0 || !clientName || !clientEmail || !clientPhone) {
            alert('Please fill in all required client details and select at least one photo.');
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;

        try {
            // CHANGED: Use relative path
            const response = await fetch('/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientName,
                    clientEmail,
                    clientPhone,
                    selectedPhotos: selections
                }),
            });

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

            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            logError(`Submission failed: ${error.message}`);
            alert(`There was an error submitting your selections: ${error.message}`);
            submitBtn.textContent = 'Submit Selections';
            submitBtn.disabled = false;
        }
    });

    loadSelectionsFromLocalStorage();
    loadPhotosFromServer();
});