const API_URL = "https://labelgenerator-production.up.railway.app";

// Custom notification function
function showNotification(message, type = 'error') {
  const existing = document.querySelector('.custom-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `custom-notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${type === 'success' ? '✓' : '⚠'}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);

  setTimeout(() => notification.classList.add('show'), 10);
}

// Összes címkeszám betöltése
async function loadTotalLabelCount() {
  try {
    const response = await fetch(`${API_URL}/api/total-label-count`);
    if (response.ok) {
      const data = await response.json();
      updateCounterDisplay(data.total_count);
    }
  } catch (error) {
    console.error("Error loading label count:", error);
  }
}

function updateCounterDisplay(count) {
  const counterElement = document.getElementById("totalLabelCount");
  if (counterElement) {
    animateCounter(counterElement, 0, count, 2000);
  }
}

function animateCounter(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16); // 60 FPS
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
    }
    element.textContent = Math.floor(current).toLocaleString('hu-HU');
  }, 16);
}

// Dinamikus oldaltöltés
function loadPage(page) {
  const pageContent = document.getElementById('page-content');

  // Scroll to top
  window.scrollTo(0, 0);

  switch(page) {
    case 'about':
      loadAboutPage();
      break;
    case 'login':
      loadLoginPage();
      break;
    case 'info':
      loadInfoPage();
      break;
    case 'examples':
      loadExamplesPage();
      break;
    case 'contact':
      loadContactPage();
      break;
    default:
      loadAboutPage();
  }

  // Update active nav link
  updateActiveNav(page);

  // Reinitialize scroll animations for new content
  setTimeout(initScrollAnimations, 100);
}

function updateActiveNav(page) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${page}`) {
      link.classList.add('active');
    }
  });
}

function loadAboutPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-wrapper">
      <div class="about-container">
        <h2 class="page-title scroll-animate-fade" data-lang="about-title">Welcome to Label Labor!</h2>
        <p class="about-intro scroll-animate" data-lang="about-intro">In most stores, creating uniform shelf labels quickly and efficiently can be a real challenge. Label Labor provides an easy solution: generate labels directly from Excel spreadsheets and download them in PDF format.</p>
        <h3 class="benefits-title scroll-animate" data-lang="about-benefits-title">Benefits of using Label Labor:</h3>
        <ul class="benefits-list">
          <li class="scroll-animate" data-lang="about-benefit-1">Hundreds of labels in just minutes</li>
          <li class="scroll-animate" data-lang="about-benefit-2">You can save time and money on label production</li>
          <li class="scroll-animate" data-lang="about-benefit-3">Labels that can be printed on regular A4 paper — no need to buy expensive adhesive labels</li>
          <li class="scroll-animate" data-lang="about-benefit-4">You can print labels even with a regular invoice printer — no special label printer required</li>
          <li class="scroll-animate" data-lang="about-benefit-5">You can choose from multiple label types and customize the label format to your needs</li>
          <li class="scroll-animate" data-lang="about-benefit-6">Online support for bugs and modification requests even after the website is completed</li>
        </ul>
      </div>
    </div>
  `;

  // Apply language to new elements
  if (typeof changeLanguage === 'function') {
    changeLanguage(currentLang);
  }
}

function loadLoginPage() {
  const pageContent = document.getElementById('page-content');

  // Check if mobile/tablet
  const isMobileOrTablet = window.innerWidth <= 1024;

  if (isMobileOrTablet) {
    // Show mobile warning for login page only
    pageContent.innerHTML = `
      <div class="page-wrapper">
        <div class="mobile-warning" style="display: flex; position: relative;">
          <div class="mobile-warning-icon">🖥️</div>
          <h2 data-lang="desktop-only">Desktop Only</h2>
          <p data-lang="desktop-warning">Label Labor is currently only available on desktop/laptop.<br>If using a computer, please increase the window size!</p>
        </div>
      </div>
    `;
  } else {
    pageContent.innerHTML = `
      <div class="page-wrapper">
        <div class="login-wrapper">
          <form id="loginForm">
            <div class="login-container">
              <div class="label-content">
                <img src="assets/main_icon.png" alt="Logo" class="label-logo">

                <div class="inputs">
                  <div class="input-line">
                    <input type="text" id="username" placeholder="Username" required data-lang="username">
                  </div>
                  <div class="input-line">
                    <input type="password" id="password" placeholder="Password" required data-lang="password">
                  </div>
                </div>

                <div class="barcode-container">
                  <img src="assets/barcode.png" alt="Barcode">
                </div>

                <div class="price-box">
                  <span class="amount">9.900,- Ft</span>
                </div>
              </div>
            </div>

            <button type="submit" class="login-button" data-lang="login">Login</button>
            <div class="stats-container">
              <div class="stats-card">
                <span class="stats-text" data-lang="all-labels">All generated labels: <span class="stats-number" id="totalLabelCount">0</span></span>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    loadTotalLabelCount();

    // Attach login handler
    setTimeout(() => {
      const form = document.getElementById('loginForm');
      if (form) {
        form.addEventListener('submit', handleLogin);
      }
    }, 0);
  }

  if (typeof changeLanguage === 'function') {
    changeLanguage(currentLang);
  }
}

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const submitBtn = document.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Login...";
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Server error:", errorText);
      showNotification("Invalid username or password!", 'error');
      return;
    }

    const data = await res.json();
    
    sessionStorage.setItem('currentUsername', username);
    
    showNotification("Login successful! Redirecting...", 'success');
    
    setTimeout(() => {
      window.location.href = data.redirect_url;
    }, 1500);
    
  } catch (err) {
    console.error("Login error:", err);
    showNotification("Server error! Please try again.", 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

function loadInfoPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-wrapper info-page-wrapper">
      <div class="content-grid">
        <div class="video-section scroll-animate-left">
          <h2 data-lang="demo-video">Tutorial Video</h2>
          <div class="video-wrapper">
            <iframe
              src="https://www.youtube.com/embed/yNzP4EEFOaQ"
              title="Label Labor demo"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen>
            </iframe>
          </div>
        </div>

        <div class="steps-section">
          <h2 class="scroll-animate-fade" data-lang="user-guide">User Guide</h2>
          <div class="steps-list">
            <div class="step-item scroll-animate-right">
              <div class="step-number">1</div>
              <div class="step-content">
                <h3 data-lang="step1-title">Login</h3>
                <p data-lang="step1-desc">Log in to the main page using the provided username and password.</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">2</div>
              <div class="step-content">
                <h3 data-lang="step2-title">Download Template Excel File</h3>
                <p data-lang="step2-desc">Download the template Excel file by clicking the "Download Template Excel" button. After opening the Excel file, you must enable macros. In case of problems: info@labellabor.com</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">3</div>
              <div class="step-content">
                <h3 data-lang="step3-title">Fill in Template Excel Cells</h3>
                <p data-lang="step3-desc">Copy the appropriate data into the <span style="color: red;">red</span> columns (max approx. 350 rows), ensuring there are no unnecessary rows (inside and outside cells) or line breaks. In the "Packaging" column, the quantity and unit should be separated by a space, e.g., "1 kg" or "400 ml". For piece packaging, the correct format is: "pcs". For the "Price" column, you don't need to write "Ft" or "forint", the correct format is e.g., "999". After checking the pasted data, run the macro named "Adatok_rendszerezese", which will help the program fill in the cells found in the <span style="color: #378eff;">blue</span> columns.</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">4</div>
              <div class="step-content">
                <h3 data-lang="step4-title">Check/Modify Cell Contents</h3>
                <p data-lang="step4-desc">The cells in the <span style="color: #378eff;">blue</span> columns can also be manually modified where necessary. After checking all the data, save the file.</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">5</div>
              <div class="step-content">
                <h3 data-lang="step5-title">Upload Excel File, Select Label Type</h3>
                <p data-lang="step5-desc">By clicking the "Upload Excel File (.xlsm)" button, upload the previously edited Excel template file. Then, if there are multiple label types, select the appropriate one.</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">6</div>
              <div class="step-content">
                <h3 data-lang="step6-title">Check Labels, Download PDF</h3>
                <p data-lang="step6-desc">After checking the data on the labels, click the "Download PDF" button to download the labels.pdf file. You can follow this process with the "Downloading PDF..." bar. If you want to generate new labels, make sure to refresh the page first.</p>
              </div>
            </div>

            <div class="step-item scroll-animate-right">
              <div class="step-number">7</div>
              <div class="step-content">
                <h3 data-lang="step7-title">Printing the labels</h3>
                <p data-lang="step7-desc">Printing the labels.pdf file with any standard printer (for example, the kind used for printing invoices).</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (typeof changeLanguage === 'function') {
    changeLanguage(currentLang);
  }
}

function loadExamplesPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="pdf-wrapper">
      <div class="pdf-container">
        <iframe src="assets/example_labels.pdf" type="application/pdf" width="100%" height="100%"></iframe>
      </div>
    </div>
  `;
  
  if (typeof changeLanguage === 'function') {
    changeLanguage(currentLang);
  }
}

function loadContactPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="page-wrapper">
      <div class="contact-container">
        <h2 class="page-title scroll-animate-fade" data-lang="contact-form-title">Request a Personalized Quote!</h2>

        <div class="contact-grid">
          <div class="contact-left scroll-animate-left">
            <form id="contactForm" class="contact-form">
              <div class="form-group">
                <label for="contactName"></label>
                <input type="text" id="contactName" name="name" required placeholder="Full Name" data-lang="contact-name">
              </div>

              <div class="form-group">
                <label for="contactEmail"></label>
                <input type="email" id="contactEmail" name="email" required placeholder="Email Address" data-lang="contact-email">
              </div>

              <div class="form-group">
                <label for="contactCompany"></label>
                <input type="text" id="contactCompany" name="company" required placeholder="Company Name" data-lang="contact-company">
              </div>

              <div class="form-group">
                <label for="contactMessage"></label>
                <textarea id="contactMessage" name="message" required placeholder="Message" rows="6" data-lang="contact-message"></textarea>
              </div>

              <button type="submit" class="contact-submit-btn" data-lang="contact-submit">Send Request</button>
            </form>
          </div>

          <div class="contact-right">
            <div class="contact-info-section scroll-animate-right">
              <h3 class="contact-subtitle" data-lang="contact-subtitle-1">Pricing and Information</h3>
              <p class="contact-text" data-lang="contact-text-1">
                A custom dashboard and training for your company comes with a one-time fee.
              </p>
              <p class="contact-text" data-lang="contact-text-2">
                Afterwards, a monthly fee covers maintenance, bug fixes, and implementation of modification requests.
              </p>
            </div>

            <div class="contact-info-section scroll-animate-right">
              <h3 class="contact-subtitle" data-lang="contact-subtitle-2">Helpful Information for us</h3>
              <p class="contact-text" data-lang="contact-text-3">
                Please provide the following information in the "Message" field:
              </p>
              <ul class="contact-benefits-list">
                <li data-lang="contact-benefit-1">How many different labels you want to generate on the platform</li>
                <li data-lang="contact-benefit-2">Number of logos you want to use on the various labels</li>
                <li data-lang="contact-benefit-3">Number of different label sizes</li>
                <li data-lang="contact-benefit-4">Number of stores where you will use Label Labor</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach contact form handler
  setTimeout(() => {
    const form = document.getElementById('contactForm');
    if (form) {
      form.addEventListener('submit', handleContactForm);
    }
  }, 0);

  if (typeof changeLanguage === 'function') {
    changeLanguage(currentLang);
  }
}

async function handleContactForm(e) {
  e.preventDefault();

  const name = document.getElementById('contactName').value;
  const email = document.getElementById('contactEmail').value;
  const company = document.getElementById('contactCompany').value;
  const message = document.getElementById('contactMessage').value;

  const submitBtn = document.querySelector('.contact-submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Sending...";
  submitBtn.disabled = true;

  try {
    // Simpler approach: use a service like FormSubmit or similar
    // For now, we'll use EmailJS or a similar service
    // Alternative: send to your backend API
    
    const response = await fetch('https://formspree.io/f/mkgppand', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        email: email,
        company: company,
        message: message,
        _replyto: email
      })
    }).catch(() => {
      // If external service fails, try local API
      return fetch(`${API_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          email: email,
          company: company,
          message: message
        })
      });
    });

    if (response.ok) {
      showNotification(translations[currentLang]['contact-success'], 'success');
      document.getElementById('contactForm').reset();
    } else {
      showNotification(translations[currentLang]['contact-error'], 'error');
    }
  } catch (error) {
    console.error('Contact form error:', error);
    showNotification(translations[currentLang]['contact-error'], 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// Scroll animation observer
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, observerOptions);

  // Observe all elements with animation classes
  document.querySelectorAll('.scroll-animate, .scroll-animate-fade, .scroll-animate-left, .scroll-animate-right, .scroll-animate-scale').forEach(el => {
    // Check if element is already in viewport on page load
    const rect = el.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (isInViewport) {
      // Immediately add animate-in class for elements already visible
      el.classList.add('animate-in');
    }

    // Continue observing for elements that will scroll into view later
    observer.observe(el);
  });
}

// Initialize page loading
document.addEventListener('DOMContentLoaded', () => {
  // Check URL hash or default to about
  const hash = window.location.hash.slice(1) || 'about';
  loadPage(hash);

  // Handle hash changes
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'about';
    loadPage(hash);
  });

  // Handle nav clicks
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.getAttribute('href').slice(1);
      window.location.hash = page;
    });
  });

  // Initialize scroll animations after page load
  setTimeout(initScrollAnimations, 100);
});