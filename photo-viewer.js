let currentPhotoIndex = 0;
let currentPhotos = [];

function showPhotos(placeId) {
    if (!placeId) {
        console.error('No place ID provided');
        return;
    }

    const modal = document.getElementById('photoModal');
    const slider = document.getElementById('photoSlider');
    
    // Add loading indicator
    slider.innerHTML = '<i class="fas fa-spinner fa-spin fa-2x"></i>';
    modal.style.display = 'block';
    
    service.getDetails({
        placeId: placeId,
        fields: ['photos']
    }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place.photos) {
            currentPhotos = place.photos;
            currentPhotoIndex = 0;
            showCurrentPhoto();
            setupPhotoNavigation();
        } else {
            slider.innerHTML = '<p>Error loading photos</p>';
            console.error('Places API Error:', status);
        }
    });
}

function showCurrentPhoto() {
    const slider = document.getElementById('photoSlider');
    if (currentPhotos.length > 0) {
        const photo = currentPhotos[currentPhotoIndex];
        const imgUrl = photo.getUrl({maxWidth: 1200, maxHeight: 800});
        slider.innerHTML = `<img src="${imgUrl}" alt="Place photo ${currentPhotoIndex + 1}">`;
    }
}

function setupPhotoNavigation() {
    const modal = document.getElementById('photoModal');
    const closeBtn = document.querySelector('.close');
    const prevBtn = document.querySelector('.prev');
    const nextBtn = document.querySelector('.next');
    
    // Close button
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    }
    
    // Click outside to close
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    }
    
    // Previous button
    prevBtn.onclick = function() {
        currentPhotoIndex = (currentPhotoIndex - 1 + currentPhotos.length) % currentPhotos.length;
        showCurrentPhoto();
    }
    
    // Next button
    nextBtn.onclick = function() {
        currentPhotoIndex = (currentPhotoIndex + 1) % currentPhotos.length;
        showCurrentPhoto();
    }
    
    // Keyboard navigation
    document.onkeydown = function(e) {
        if (modal.style.display === 'block') {
            if (e.key === 'ArrowLeft') {
                prevBtn.click();
            } else if (e.key === 'ArrowRight') {
                nextBtn.click();
            } else if (e.key === 'Escape') {
                closeBtn.click();
            }
        }
    }
}

// Export functions for use in other scripts
window.showPhotos = showPhotos;