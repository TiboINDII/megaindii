let map;
let service;
let infowindow;
let searchCenter; // Store search center coordinates

// Add sorting state
let currentSortColumn = 'stand';  // Set default sort column
let sortDirection = 'asc';        // Set default sort direction

function initMap() {
    try {
        // Create a minimal hidden map (required for Places API)
        const antwerp = new google.maps.LatLng(51.2194, 4.4025);
        const mapDiv = document.getElementById('map');
        mapDiv.style.height = '1px';
        mapDiv.style.visibility = 'hidden';
        
        map = new google.maps.Map(mapDiv, {
            center: antwerp,
            zoom: 15
        });
        
        // Initialize other services
        infowindow = new google.maps.InfoWindow();
        service = new google.maps.places.PlacesService(map);

        // Remove automatic search
        initializeSearchForm();
    } catch (error) {
        console.error('Error initializing map:', error);
        showError('Error initializing map service');
    }
}

function initializeSearchForm() {
    const form = document.getElementById('searchForm');
    const locationSlider = document.getElementById('locationCount');
    const locationValue = document.getElementById('locationValue');

    // Update slider value display
    locationSlider.addEventListener('input', function() {
        locationValue.textContent = this.value;
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const location = document.getElementById('location').value;
        const businessType = document.getElementById('businessType').value;
        const maxLocations = parseInt(locationSlider.value); // Remove the Math.min restriction
        
        if (!location || !businessType) {
            showError('Please fill in all fields');
            return;
        }

        performSearch(location, businessType, maxLocations);
    });
}

function performSearch(location, businessType, maxLocations) {
    try {
        const loading = document.getElementById('loading');
        const errorMessage = document.getElementById('errorMessage');
        const resultsTable = document.getElementById('resultsTable');
        
        loading.style.display = 'block';
        errorMessage.style.display = 'none';
        resultsTable.style.display = 'none';

        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: location }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK) {
                searchCenter = results[0].geometry.location;
                let allResults = [];
                
                function searchNextPage(pageToken = null) {
                    const request = {
                        location: searchCenter,
                        radius: 5000,
                        keyword: businessType,
                        pageToken: pageToken
                    };

                    service.nearbySearch(request, (results, status, pagination) => {
                        if (status === google.maps.places.PlacesServiceStatus.OK) {
                            allResults = allResults.concat(results);

                            if (pagination && pagination.hasNextPage && allResults.length < maxLocations) {
                                // Wait before making the next request to avoid OVER_QUERY_LIMIT
                                setTimeout(() => {
                                    pagination.nextPage();
                                }, 2000);
                            } else {
                                // Always get exactly maxLocations number of results
                                const limitedResults = allResults.slice(0, maxLocations);
                                if (limitedResults.length < maxLocations && pagination && pagination.hasNextPage) {
                                    // Continue searching if we haven't reached the desired count
                                    setTimeout(() => {
                                        pagination.nextPage();
                                    }, 2000);
                                } else {
                                    processResults(limitedResults);
                                    loading.style.display = 'none';
                                }
                            }
                        } else {
                            showError('Er is een fout opgetreden bij het ophalen van de resultaten.');
                            console.error('Places search failed:', status);
                            loading.style.display = 'none';
                        }
                    });
                }

                // Start the first search
                searchNextPage();
            } else {
                showError('Locatie niet gevonden.');
                loading.style.display = 'none';
                console.error('Geocoding failed:', status);
            }
        });
    } catch (error) {
        console.error('Error in performSearch:', error);
        showError('Er is een fout opgetreden.');
        loading.style.display = 'none';
    }
}

function processResults(results) {
    const resultsBody = document.getElementById('resultsBody');
    const resultsTable = document.getElementById('resultsTable');
    resultsBody.innerHTML = '';
    
    let rowsData = [];
    let processedCount = 0;
    const totalCount = results.length;

    results.forEach(place => {
        service.getDetails({ 
            placeId: place.place_id,
            fields: [
                'name',
                'formatted_address',
                'formatted_phone_number',
                'website',
                'url',
                'rating',
                'user_ratings_total',
                'opening_hours',
                'reviews',
                'geometry',
                'photos',
                'business_status',
                'types',
                'price_level',
                'international_phone_number'
            ]
        }, (placeDetails, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                // Calculate distance from search center
                const placeLocation = placeDetails.geometry.location;
                const distance = (google.maps.geometry.spherical.computeDistanceBetween(
                    searchCenter, 
                    placeLocation
                ) / 1000).toFixed(2) + ' km';

                // Parse address
                let streetAddress = '-';
                let postalAndCity = '-';
                
                if (placeDetails.formatted_address) {
                    const parts = placeDetails.formatted_address.split(',');
                    streetAddress = parts[0]?.trim() || '-';
                    postalAndCity = parts[1]?.trim() || '-';
                }

                // Format social media links
                const socialLinks = formatSocialLinks(placeDetails);

                // Get primary category
                const category = place.types ? 
                    place.types[0].split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ') : 
                    '-';

                // Try to find owner information from reviews
                let potentialOwner = '-';
                if (placeDetails.reviews) {
                    const ownerReview = placeDetails.reviews.find(review => 
                        review.author_name && 
                        (review.text?.toLowerCase().includes('owner') ||
                         review.text?.toLowerCase().includes('eigenaar'))
                    );
                    if (ownerReview) {
                        potentialOwner = ownerReview.author_name;
                    }
                }

                // Enhanced business status
                const businessStatus = placeDetails.business_status === 'OPERATIONAL' ? 'Active' : 
                                     placeDetails.business_status === 'CLOSED_TEMPORARILY' ? 'Temporarily Closed' :
                                     placeDetails.business_status === 'CLOSED_PERMANENTLY' ? 'Permanently Closed' : '-';

                // Price level indication
                const priceLevel = placeDetails.price_level ? '€'.repeat(placeDetails.price_level) : '-';

                // Photos count
                const photoCount = placeDetails.photos?.length || 0;

                // Last review date and timestamp
                const lastReviewTimestamp = placeDetails.reviews?.[0]?.time || '-';
                const lastReviewDate = lastReviewTimestamp !== '-' ? 
                    new Date(lastReviewTimestamp * 1000).toLocaleDateString() : '-';

                const rowData = {
                    name: placeDetails.name || '-',
                    owner: potentialOwner,
                    category: category,
                    streetAddress,
                    postalAndCity,
                    phone: placeDetails.formatted_phone_number || placeDetails.international_phone_number || '-',
                    socialLinks,
                    closingDays: formatOpeningHours(placeDetails.opening_hours).closingDays,
                    rating: placeDetails.rating || '-',
                    ratingCount: placeDetails.user_ratings_total || 0,
                    businessStatus: businessStatus,
                    priceLevel: priceLevel,
                    photoCount: placeDetails.photos ? 
                        `<i class="fas fa-images photo-icon" onclick="showPhotos(\`${place.place_id}\`)"></i> ${placeDetails.photos.length}` : 
                        '0',
                    lastReviewDate: lastReviewDate,
                    lastReviewTimestamp: placeDetails.reviews?.[0]?.time || 0,
                    distance: distance
                };

                rowsData.push(rowData);
                processedCount++;
                
                // Only update table when all places are processed
                if (processedCount === totalCount) {
                    // Calculate ranks and update table
                    rowsData = calculateTiboRank(rowsData);
                    updateTable(rowsData);
                    
    // Sort by stand column immediately after table population
    setTimeout(() => {
        handleSort('stand', 'number');
    }, 0);
                }
            }
        });
    });

    resultsTable.style.display = 'table';
}

const WEIGHTS = {
    rating: 0.25,
    ratingCount: 0.20,
    socialLinks: 0.15,
    lastReviewDate: 0.15,
    photos: 0.10,
    priceLevel: 0.10,
    closingDays: 0.05
};

function calculateTiboRank(rowsData) {
    // Filter only active businesses
    const activeBusinesses = rowsData.filter(row => row.businessStatus === 'Active');
    const totalActive = activeBusinesses.length;
    
    // Initialize scores object
    const scores = activeBusinesses.map(row => ({
        name: row.name,
        weightedScore: 0,
        validMetrics: new Set(),
        individualScores: {}, // For weighted scores
        individualRanks: {}   // For actual positions
    }));

    // Helper function to rank values and apply weights
    const rankValues = (values, weight, isAscending = true) => {
        const validValues = values.filter(v => v !== '-' && v !== null && v !== undefined);
        const sorted = [...validValues].sort((a, b) => isAscending ? a - b : b - a);
        return validValues.map(v => ({
            rank: sorted.indexOf(v) + 1,
            score: ((sorted.length - sorted.indexOf(v)) / sorted.length) * weight,
            normalizedScore: ((sorted.length - sorted.indexOf(v)) / sorted.length) * 100,
            actualRank: sorted.indexOf(v) + 1  // Add actual position
        }));
    };

    // Calculate social media score (15%)
    activeBusinesses.forEach((business, index) => {
        const linkCount = (business.socialLinks.match(/<a/g) || []).length;
        if (linkCount > 0) {
            const maxLinks = Math.max(...activeBusinesses.map(b => 
                (b.socialLinks.match(/<a/g) || []).length));
            const score = (linkCount / maxLinks) * WEIGHTS.socialLinks;
            const normalizedScore = (linkCount / maxLinks) * 100;
            
            // Calculate actual rank for social links
            const allLinkCounts = activeBusinesses.map(b => 
                (b.socialLinks.match(/<a/g) || []).length);
            const sortedLinkCounts = [...new Set(allLinkCounts)].sort((a, b) => b - a);
            const rank = sortedLinkCounts.indexOf(linkCount) + 1;
            
            scores[index].weightedScore += score;
            scores[index].validMetrics.add('socialLinks');
            scores[index].individualScores.socialLinks = Math.round(normalizedScore);
            scores[index].individualRanks.socialLinks = rank;
        }
    });

    // Calculate other metrics with their weights
    const metrics = [
        {
            name: 'rating',
            getValue: b => b.rating === '-' ? null : parseFloat(b.rating),
            weight: WEIGHTS.rating,
            ascending: false
        },
        {
            name: 'ratingCount',
            getValue: b => b.ratingCount === '-' ? null : parseInt(b.ratingCount),
            weight: WEIGHTS.ratingCount,
            ascending: false
        },
        {
            name: 'priceLevel',
            getValue: b => b.priceLevel === '-' ? null : b.priceLevel.length,
            weight: WEIGHTS.priceLevel,
            ascending: false
        },
        {
            name: 'photos',
            getValue: b => {
                const photoCount = b.photoCount.match(/\d+/);
                return photoCount ? parseInt(photoCount[0]) : null;
            },
            weight: WEIGHTS.photos,
            ascending: false
        },
        {
            name: 'lastReviewDate',
            getValue: b => b.lastReviewDate === '-' ? null : new Date(b.lastReviewDate).getTime(),
            weight: WEIGHTS.lastReviewDate,
            ascending: false
        },
        {
            name: 'closingDays',
            getValue: b => {
                if (b.closingDays === 'geen') return 0;
                if (b.closingDays === '-') return null;
                return b.closingDays.split(',').length;
            },
            weight: WEIGHTS.closingDays,
            ascending: true
        }
    ];

    metrics.forEach(metric => {
        const values = activeBusinesses.map(metric.getValue);
        const rankedScores = rankValues(values, metric.weight, metric.ascending);
        rankedScores.forEach((score, idx) => {
            if (score) {
                scores[idx].weightedScore += score.score;
                scores[idx].validMetrics.add(metric.name);
                scores[idx].individualScores[metric.name] = Math.round(score.normalizedScore);
                scores[idx].individualRanks[metric.name] = score.actualRank;
            }
        });
    });

    // Calculate final scores
    scores.forEach(score => {
        score.finalScore = score.validMetrics.size > 0 ? 
            score.weightedScore / (Array.from(score.validMetrics).reduce((acc, metric) => 
                acc + WEIGHTS[metric], 0)) : 0;
    });

    // Rank businesses based on final scores
    const sortedScores = scores
        .map((score, index) => ({ 
            score: score.finalScore, 
            index, 
            individualScores: score.individualScores,
            individualRanks: score.individualRanks 
        }))
        .sort((a, b) => b.score - a.score);

    // Add ranks to rowsData with visual elements and individual ranks
    rowsData.forEach((row, index) => {
        if (row.businessStatus === 'Active') {
            const rankInfo = sortedScores.find(s => s.index === index);
            const rank = sortedScores.findIndex(s => s.index === index) + 1;
            const heatLevel = Math.ceil((rank / totalActive) * 8);
            const isTopHalf = rank <= totalActive / 2;
            const icon = isTopHalf ? '👍' : '👎';
            
            // Format individual ranks
            const ranks = rankInfo.individualRanks;
            const scoreDetails = `
                <div class="score-details">
                    <div>Rating: #${ranks.rating || '-'}/${totalActive}</div>
                    <div>Reviews: #${ranks.ratingCount || '-'}/${totalActive}</div>
                    <div>Social: #${ranks.socialLinks || '-'}/${totalActive}</div>
                    <div>Last Review: #${ranks.lastReviewDate || '-'}/${totalActive}</div>
                    <div>Photos: #${ranks.photos || '-'}/${totalActive}</div>
                    <div>Price: #${ranks.priceLevel || '-'}/${totalActive}</div>
                    <div>Hours: #${ranks.closingDays || '-'}/${totalActive}</div>
                </div>
            `;
            
            row.tiboRank = `
                <div class="rank-cell heat-${heatLevel}">
                    <div class="rank-main">#${rank} ${icon}</div>
                    ${scoreDetails}
                </div>`;
        } else {
            row.tiboRank = '<div class="rank-cell">-</div>';
        }
    });

    return rowsData;
}

function findDuplicates(rowsData) {
    const duplicates = {
        name: new Map(),
        streetAddress: new Map(),
        phone: new Map()
    };
    
    // Store phone numbers with their addresses and mark duplicates
    const phoneAddresses = new Map();
    const phonesWithDifferentAddresses = new Set();

    // First pass: Collect all phone numbers and their addresses
    rowsData.forEach(row => {
        const phone = row.phone.toLowerCase().trim();
        const address = row.streetAddress.toLowerCase().trim();
        
        if (phone !== '-') {
            if (!phoneAddresses.has(phone)) {
                phoneAddresses.set(phone, new Set());
            }
            if (address !== '-') {
                phoneAddresses.get(phone).add(address);
            }
        }

        // Also count regular duplicates
        ['name', 'streetAddress', 'phone'].forEach(field => {
            const value = row[field].toLowerCase().trim();
            if (value !== '-') {
                duplicates[field].set(value, (duplicates[field].get(value) || 0) + 1);
            }
        });
    });

    // Second pass: Identify phones with different addresses
    phoneAddresses.forEach((addresses, phone) => {
        if (addresses.size > 1) {
            console.log(`Found phone ${phone} with multiple addresses:`, Array.from(addresses));
            phonesWithDifferentAddresses.add(phone);
        }
    });

    // Filter to only keep actual duplicates (count > 1)
    const duplicateValues = {
        name: new Set([...duplicates.name.entries()]
            .filter(([_, count]) => count > 1)
            .map(([value]) => value)),
        streetAddress: new Set([...duplicates.streetAddress.entries()]
            .filter(([_, count]) => count > 1)
            .map(([value]) => value)),
        phone: new Set([...duplicates.phone.entries()]
            .filter(([_, count]) => count > 1)
            .map(([value]) => value))
    };

    // Get counts for headers
    const duplicateCounts = {
        name: duplicateValues.name.size,
        streetAddress: duplicateValues.streetAddress.size,
        phone: duplicateValues.phone.size
    };

    return { duplicateValues, duplicateCounts, phonesWithDifferentAddresses };
}

function updateTable(rowsData) {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';

    // Find duplicates
    const { duplicateValues, duplicateCounts, phonesWithDifferentAddresses } = findDuplicates(rowsData);

    // Update headers with duplicate counts
    const headers = document.querySelectorAll('#resultsTable th');
    headers.forEach(header => {
        const column = header.getAttribute('data-column');
        if (['name', 'streetAddress', 'phone'].includes(column)) {
            const count = duplicateCounts[column];
            const originalText = header.textContent.split(' ')[0].trim();
            if (count > 0) {
                header.innerHTML = `${originalText} <span style="color: #ff4444">${count}</span>`;
            } else {
                header.textContent = originalText;
            }
        }
    });

    // Set default sorting
    currentSortColumn = 'stand';
    sortDirection = 'asc';

    // Update sorting indicator on the header
    const standHeader = Array.from(headers).find(h => h.getAttribute('data-column') === 'stand');
    headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    standHeader.classList.add('sort-asc');


    rowsData.forEach(data => {
        const row = document.createElement('tr');
        // Create status indicator circle
        const statusCircle = data.businessStatus === 'Active' 
            ? '<span style="color: #4CAF50;">●</span> ' 
            : '<span style="color: #f44336;">●</span> ';
            
        // Check if values are duplicates and add style accordingly
        const isDuplicateName = duplicateValues.name.has(data.name.toLowerCase().trim());
        const isDuplicateAddress = duplicateValues.streetAddress.has(data.streetAddress.toLowerCase().trim());
        const isDuplicatePhone = duplicateValues.phone.has(data.phone.toLowerCase().trim());

        const nameStyle = isDuplicateName ? 'color: #ff4444; font-weight: bold;' : '';
        const addressStyle = isDuplicateAddress ? 'color: #ff4444; font-weight: bold;' : '';
        const phoneStyle = isDuplicatePhone ? 'color: #ff4444; font-weight: bold;' : '';
            
        // Format phone number with clickable icon
        const phoneNumber = data.phone !== '-' ? data.phone : '-';
            
            // Pre-calculate all ranks
            const allRanks = rowsData.map(item => {
                const reviewRank = rowsData
                    .map(i => i.ratingCount)
                    .sort((a, b) => b - a)
                    .indexOf(item.ratingCount) + 1;

                const timestamps = rowsData
                    .map(i => i.lastReviewTimestamp)
                    .filter(ts => ts !== '-' && ts !== 0)
                    .sort((a, b) => b - a);
                
                const lastReviewRank = item.lastReviewTimestamp === '-' || item.lastReviewTimestamp === 0 
                    ? rowsData.length 
                    : timestamps.indexOf(item.lastReviewTimestamp) + 1;

                return {
                    item,
                    reviewRank,
                    lastReviewRank,
                    sum: reviewRank + lastReviewRank
                };
            });

            // Sort by sum to get final rankings
            allRanks.sort((a, b) => a.sum - b.sum);
            const currentRanks = allRanks.find(r => r.item === data);
            const finalRank = allRanks.findIndex(r => r.item === data) + 1;

            // Check conditions for icons
            const hasLowReviews = data.ratingCount < 100;
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            const lastReviewDate = data.lastReviewTimestamp ? new Date(data.lastReviewTimestamp * 1000) : null;
            const isOldReview = lastReviewDate ? lastReviewDate < twoYearsAgo : true;
            
            const needsAttention = hasLowReviews && isOldReview;
            const icon = needsAttention ? 
                '<i class="fas fa-thumbs-down" style="color: #ff4444; margin-left: 5px;"></i>' : 
                '<i class="fas fa-thumbs-up" style="color: #4CAF50; margin-left: 5px;"></i>';

            // Check if this phone number has multiple addresses
            const phone = data.phone.toLowerCase().trim();
            let starIcon = '';
            
            if (phone !== '-' && phonesWithDifferentAddresses.has(phone)) {
                console.log(`Adding star for ${data.name} (${phone})`);
                starIcon = '<i class="fas fa-star" style="color: #FFD700; margin-left: 5px;" title="Same phone number used at different addresses"></i>';
            }

            row.innerHTML = `
                <td class="stand-cell" 
                    title="Reviews rank: #${currentRanks.reviewRank}, Last review rank: #${currentRanks.lastReviewRank} (Sum: ${currentRanks.sum})"
                    data-rank="${finalRank}">${finalRank}${icon}</td>
                <td style="${nameStyle}">${statusCircle}${data.name}${starIcon}</td>
            <td>${data.owner}</td>
            <td>${data.category}</td>
            <td style="${addressStyle}">${data.streetAddress}</td>
            <td>${data.postalAndCity}</td>
            <td style="${phoneStyle}">${phoneNumber}</td>
            <td>${data.socialLinks}</td>
            <td>${data.closingDays}</td>
            <td>${typeof data.rating === 'number' ? data.rating.toFixed(1) + ' ⭐' : '-'}</td>
            <td>${data.ratingCount}</td>
            <td>${data.priceLevel}</td>
            <td>${data.photoCount}</td>
            <td>${data.lastReviewDate}</td>
            <td>${data.distance}</td>
        `;
        resultsBody.appendChild(row);
    });

    // Add download button after table is populated
    addDownloadButton();
}

function formatSocialLinks(placeDetails) {
    const links = [];
    
    // Website link
    if (placeDetails.website) {
        links.push(`<a href="${placeDetails.website}" target="_blank" title="Website"><i class="fas fa-globe"></i></a>`);
    }
    
    // Google Maps link
    if (placeDetails.url) {
        links.push(`<a href="${placeDetails.url}" target="_blank" title="Google Maps"><i class="fas fa-map-marker-alt"></i></a>`);
    }

    // Try to find social media links in website
    if (placeDetails.website) {
        const website = placeDetails.website.toLowerCase();
        if (website.includes('facebook.com')) {
            links.push(`<a href="${website}" target="_blank" title="Facebook"><i class="fab fa-facebook"></i></a>`);
        }
        if (website.includes('instagram.com')) {
            links.push(`<a href="${website}" target="_blank" title="Instagram"><i class="fab fa-instagram"></i></a>`);
        }
        if (website.includes('linkedin.com')) {
            links.push(`<a href="${website}" target="_blank" title="LinkedIn"><i class="fab fa-linkedin"></i></a>`);
        }
    }

    return links.length > 0 ? links.join(' ') : '-';
}

function formatOpeningHours(openingHours) {
    if (!openingHours || !openingHours.periods) {
        return { closingDays: '-' };
    }

    const weekDays = [
        { en: 'Monday', nl: 'ma' },
        { en: 'Tuesday', nl: 'di' },
        { en: 'Wednesday', nl: 'wo' },
        { en: 'Thursday', nl: 'do' },
        { en: 'Friday', nl: 'vr' },
        { en: 'Saturday', nl: 'za' },
        { en: 'Sunday', nl: 'zo' }
    ];
    
    const closedDays = [];
    const openDays = new Set();

    // Check each period to determine which days the place is open
    openingHours.periods.forEach(period => {
        if (period.open && period.open.day >= 0 && period.open.day <= 6) {
            openDays.add(period.open.day);
        }
    });

    // Find which days are closed (not in openDays)
    weekDays.forEach((day, index) => {
        if (!openDays.has(index)) {
            closedDays.push(day.nl);
        }
    });

    // If open all days
    if (openDays.size === 7) {
        return { closingDays: 'geen' };
    }

    // If we have closed days
    return {
        closingDays: closedDays.length ? closedDays.join(', ') : '-'
    };
}

// Add sorting functionality
function initializeSorting() {
    const sortableColumns = {
        'stand': 'number',
        'name': 'text',
        'owner': 'text',
        'category': 'text',
        'streetAddress': 'text',
        'postalAndCity': 'text',
        'phone': 'text',
        'email': 'text',
        'socialLinks': 'text',
        'closingDays': 'text',
        'rating': 'number',
        'ratingCount': 'number',
        'priceLevel': 'text',
        'photoCount': 'number',
        'lastReviewDate': 'text',
        'distance': 'number'
    };

    const headers = document.querySelectorAll('#resultsTable th');
    headers.forEach(header => {
        const column = header.getAttribute('data-column');
        if (sortableColumns[column]) {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => handleSort(column, sortableColumns[column]));
        }
    });
}

function handleSort(column, type) {
    const headers = document.querySelectorAll('#resultsTable th');
    const clickedHeader = Array.from(headers).find(h => h.getAttribute('data-column') === column);
    
    // Remove sorting indicators from all headers
    headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

    // Update sorting state
    if (currentSortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        sortDirection = column === 'stand' ? 'asc' : 'desc'; // Default to ascending for 'stand', descending for others
    }

    // Add sorting indicator to clicked header
    clickedHeader.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

    // Sort the table
    const tbody = document.querySelector('#resultsBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));

    // Get the column index
    const headerRow = document.querySelector('#resultsTable thead tr');
    const columnIndex = Array.from(headerRow.children).findIndex(th => th.getAttribute('data-column') === column);

    // Sort rows
    rows.sort((rowA, rowB) => {
        if (column === 'stand') {
            // Get the rank values from the data-rank attribute
            const aVal = parseInt(rowA.cells[columnIndex].getAttribute('data-rank')) || Number.MAX_SAFE_INTEGER;
            const bVal = parseInt(rowB.cells[columnIndex].getAttribute('data-rank')) || Number.MAX_SAFE_INTEGER;
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        let a = rowA.cells[columnIndex].textContent.trim();
        let b = rowB.cells[columnIndex].textContent.trim();

        if (column === 'lastReviewDate') {
            const parseDate = (dateStr) => {
                if (dateStr === '-') return new Date(0);
                const [day, month, year] = dateStr.split('/');
                return new Date(year, month - 1, day);
            };
            
            a = parseDate(a);
            b = parseDate(b);
            return sortDirection === 'asc' ? a - b : b - a;  // Normal comparison
        } else if (type === 'number') {
            a = parseFloat(a.replace(/[^\d.-]/g, '')) || 0;
            b = parseFloat(b.replace(/[^\d.-]/g, '')) || 0;
            return sortDirection === 'asc' ? a - b : b - a;  // Normal comparison
        } else {
            return sortDirection === 'asc' ? 
                a.localeCompare(b) : 
                b.localeCompare(a);  // Normal comparison
        }
    });

    // Clear and re-append sorted rows
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// Call this function after the table is initially populated
document.addEventListener('DOMContentLoaded', () => {
    initializeSorting();
});

function sortTable(column, header) {
    const table = document.getElementById('resultsTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Remove sorting indicators from all headers
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Determine sort direction
    const isAsc = header.classList.contains('sort-desc');
    header.classList.add(isAsc ? 'sort-asc' : 'sort-desc');
    
    // Sort rows
    const sortedRows = rows.sort((a, b) => {
        const aValue = a.querySelector(`td:nth-child(${getColumnIndex(column)})`).textContent;
        const bValue = b.querySelector(`td:nth-child(${getColumnIndex(column)})`).textContent;
        
        if (column === 'rating' || column === 'ratingCount' || column === 'distance') {
            return compareNumbers(aValue, bValue, isAsc);
        }
        return compareStrings(aValue, bValue, isAsc);
    });
    
    // Update table
    tbody.innerHTML = '';
    sortedRows.forEach(row => tbody.appendChild(row));
}

function getColumnIndex(column) {
    const headers = document.querySelectorAll('#resultsTable th');
    for (let i = 0; i < headers.length; i++) {
        if (headers[i].getAttribute('data-column') === column) {
            return i + 1;
        }
    }
    return 1;
}

function compareNumbers(a, b, isAsc) {
    const numA = parseFloat(a.replace(/[^\d.-]/g, ''));
    const numB = parseFloat(b.replace(/[^\d.-]/g, ''));
    return isAsc ? numA - numB : numB - numA;
}

function compareStrings(a, b, isAsc) {
    return isAsc ? a.localeCompare(b) : b.localeCompare(a);
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const location = document.getElementById('location').value;
    const businessType = document.getElementById('businessType').value;
    performSearch(location, businessType);
});

// Add download buttons
function addDownloadButtons() {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'download-buttons';
    buttonContainer.innerHTML = `
        <button onclick="downloadResults('excel')" class="btn-download">
            <i class="fas fa-file-excel"></i> Download Excel
        </button>
        <button onclick="downloadResults('csv')" class="btn-download">
            <i class="fas fa-file-csv"></i> Download CSV
        </button>
        <button onclick="toggleMobileView()" class="btn-download btn-mobile-view" id="toggleViewBtn">
            <i class="fas fa-mobile-alt"></i> Mobiele weergave
        </button>
    `;
    document.getElementById('resultsTable').parentNode.insertBefore(buttonContainer, document.getElementById('resultsTable'));
}

function downloadResults(format) {
    const rows = Array.from(document.querySelectorAll('#resultsBody tr'));
    const headers = Array.from(document.querySelectorAll('#resultsTable th')).map(th => th.textContent);
    
    let data = [headers];
    rows.forEach(row => {
        const rowData = Array.from(row.cells).map(cell => cell.textContent.replace(/[↑↓]/g, '').trim());
        data.push(rowData);
    });

    if (format === 'csv') {
        downloadCSV(data);
    } else {
        downloadExcel(data);
    }
}

function downloadCSV(data) {
    const csvContent = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'business_results.csv';
    link.click();
}

function downloadExcel(data) {
    const table = document.getElementById('resultsTable');
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Process the data for Excel
    const excelData = rows.map((row, rowIndex) => {
        return Array.from(row.cells).map((cell, columnIndex) => {
            let value = cell.textContent;
            
            // Clean business name column (first column)
            if (columnIndex === 0) {
                // Remove the status circle (● character and surrounding spaces)
                value = value.replace(/[●]\s*/, '').trim();
            }
            
            // Replace social media icons with website URL (social media column)
            if (columnIndex === 6) { // Social media column index
                const websiteLink = cell.querySelector('a[title="Website"]');
                value = websiteLink ? websiteLink.href : '-';
            }
            
            // Remove any other special characters and trim
            return value.replace(/[↑↓]/g, '').trim();
        });
    });

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    
    // Generate Excel file and trigger download
    XLSX.writeFile(wb, "business_results.xlsx");
}



function downloadTableToExcel() {
    const table = document.getElementById('resultsTable');
    const rows = Array.from(table.querySelectorAll('tr'));
    
    // Process the data for Excel
    const data = rows.map((row, rowIndex) => {
        return Array.from(row.cells).map((cell, columnIndex) => {
            let value = cell.textContent;
            
            // Clean business name column (first column)
            if (columnIndex === 0) {
                // Remove the status circle (● character and surrounding spaces)
                value = value.replace(/●\s*/, '').trim();
            }
            
            // Replace social media icons with website URL (social media column)
            if (columnIndex === 6) { // Social media column index
                const websiteLink = cell.querySelector('a[title="Website"]');
                value = websiteLink ? websiteLink.href : '-';
            }
            
            // Remove any other special characters and trim
            return value.replace(/[↑↓]/g, '').trim();
        });
    });

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    
    // Generate Excel file and trigger download
    XLSX.writeFile(wb, "business_results.xlsx");
}

function toggleMobileView() {
    const table = document.getElementById('resultsTable');
    const rows = Array.from(document.querySelectorAll('#resultsBody tr'));
    const toggleBtn = document.getElementById('toggleViewBtn');
    
    if (!table.classList.contains('mobile-view')) {
        // Switch to mobile view
        table.classList.add('mobile-view');
        toggleBtn.innerHTML = '<i class="fas fa-table"></i> Tabel weergave';
        
        rows.forEach(row => {
            const cells = Array.from(row.cells);
            const mobileRow = document.createElement('div');
            mobileRow.className = 'mobile-row';
            
            // Get the status circle from the name
            const statusCircle = cells[0].innerHTML.match(/<span style="color: #[0-9a-fA-F]{6};">●<\/span>/)?.[0] || '';
            
            // Create mobile-friendly layout
            mobileRow.innerHTML = `
                <div class="business-name">${statusCircle}${cells[0].textContent.replace(/[●]/, '').trim()}</div>
                <div class="business-phone">${cells[5].innerHTML}</div>
                <div class="business-address">${cells[3].textContent}, ${cells[4].textContent}</div>
                <div class="business-details">
                    <span class="rating">${cells[8].textContent}</span>
                    <span class="social-links">${cells[6].innerHTML}</span>
                </div>
            `;
            
            row.style.display = 'none';
            row.parentNode.insertBefore(mobileRow, row);
        });
    } else {
        // Switch back to table view
        table.classList.remove('mobile-view');
        toggleBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> Mobiele weergave';
        
        document.querySelectorAll('.mobile-row').forEach(mobileRow => mobileRow.remove());
        rows.forEach(row => row.style.display = '');
    }
}

function addDownloadButton() {
    // Remove ALL existing buttons
    const existingButtons = document.querySelectorAll('.download-buttons, .download-button');
    existingButtons.forEach(button => button.remove());

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'download-buttons';
    buttonContainer.innerHTML = `
        <button onclick="downloadTableToExcel()" class="btn-download">
            <i class="fas fa-file-excel"></i> Download Excel
        </button>
        <button onclick="toggleCallList()" class="btn-download" id="callListBtn">
            <i class="fas fa-phone-alt"></i> Bel lijst
        </button>
    `;
    
    const resultsTable = document.getElementById('resultsTable');
    resultsTable.parentNode.insertBefore(buttonContainer, resultsTable);
}

function toggleCallList() {
    const table = document.getElementById('resultsTable');
    const callListBtn = document.getElementById('callListBtn');
    const rows = Array.from(document.querySelectorAll('#resultsBody tr'));
    
    if (!table.classList.contains('call-list-view')) {
        // Switch to call list view
        table.classList.add('call-list-view');
        callListBtn.innerHTML = '<i class="fas fa-table"></i> Tabel weergave';
        
        // Create call list container
        const callListContainer = document.createElement('div');
        callListContainer.id = 'callListContainer';
        callListContainer.className = 'call-list-container';
        
        // Create list items from table data
        rows.forEach(row => {
            const cells = Array.from(row.cells);
            // Extract all needed content
            // Get the full HTML content for the business name cell to preserve icons
            const nameCell = cells[1].innerHTML;
            // Extract just the business name text
            const businessName = cells[1].textContent.replace(/[●]/, '').trim();
            const standContent = cells[0].innerHTML;
            const phone = cells[6].textContent.trim(); // Phone is in 7th column
            const owner = cells[2].textContent.trim(); // Owner (Eigenaar) is in third column
            const address = cells[4].textContent.trim(); // Address is in 5th column
            const city = cells[5].textContent.trim(); // City (Plaats) is in 6th column
            
            const listItem = document.createElement('div');
            listItem.className = 'call-list-item';
            listItem.innerHTML = `
                <div class="call-list-card">
                <div class="card-front">
                    <div class="business-name">${nameCell}</div>
                    <div class="phone-number">
                        ${phone}
                        <a href="tel:${phone.replace(/[^\d+]/g, '')}" class="phone-link">
                            <i class="fas fa-phone"></i>
                        </a>
                    </div>
                    <div class="stand-info" style="margin-top: 5px; color: #666;">
                        ${standContent}
                    </div>
                </div>
                    <div class="card-back">
                    <div class="card-value">${owner}</div>
                    <div class="card-value">${address}</div>
                    <div class="card-value">${city}</div>
                    </div>
                </div>
            `;
            
            // Add click handler for card flipping
            listItem.addEventListener('click', (e) => {
                // Don't flip if clicking the phone link
                if (!e.target.closest('.phone-link')) {
                    listItem.classList.toggle('flipped');
                }
            });
            
            callListContainer.appendChild(listItem);
        });
        
        // Hide table and show call list
        table.style.display = 'none';
        table.parentNode.insertBefore(callListContainer, table.nextSibling);
        
    } else {
        // Switch back to table view
        table.classList.remove('call-list-view');
        callListBtn.innerHTML = '<i class="fas fa-phone-alt"></i> Bel lijst';
        
        // Remove call list and show table
        const callListContainer = document.getElementById('callListContainer');
        if (callListContainer) {
            callListContainer.remove();
        }
        table.style.display = 'table';
    }
}
