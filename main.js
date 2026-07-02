// Lokális teszt (Live Server) esetén automatikusan a helyi backendet hívjuk
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8000"
  : "https://labelgenerator-production.up.railway.app";

let isCounterAnimating = false;

// ── Label counter ──
async function loadTotalLabelCount() {
  try {
    const response = await fetch(`${API_URL}/api/total-label-count`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      priority: 'high',
    });
    if (response.ok) {
      const data = await response.json();
      updateCounterDisplay(data.total_count);
    }
  } catch (error) {
    console.error('Error loading label count:', error);
  }
}

function updateCounterDisplay(count) {
  const counterElement = document.getElementById('totalLabelCount');
  if (counterElement) animateCounter(counterElement, 0, count, 4000);
}

function animateCounter(element, start, end, duration) {
  isCounterAnimating = true;
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      current = end;
      clearInterval(timer);
      isCounterAnimating = false;
    }
    element.textContent = Math.floor(current).toLocaleString('hu-HU');
  }, 16);
}

// ── Notifications ──
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
  setTimeout(() => { if (notification.parentElement) notification.remove(); }, 5000);
  setTimeout(() => notification.classList.add('show'), 10);
}

// ── Login Modal ──
function openLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (typeof changeLanguage === 'function') changeLanguage(currentLang);
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const submitBtn = document.querySelector('#loginForm button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Login...';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      showNotification(translations[currentLang]['login-error'], 'error');
      return;
    }

    const data = await res.json();
    if (!data.token) {
      showNotification('Szerverhiba: a backend nem adott vissza tokent (régi verzió fut?)', 'error');
      return;
    }
    sessionStorage.setItem('currentUsername', username);
    sessionStorage.setItem('llToken', data.token);
    showNotification(translations[currentLang]['login-success'], 'success');
    closeLoginModal();

    setTimeout(() => { window.location.href = data.redirect_url; }, 1500);
  } catch (err) {
    console.error('Login error:', err);
    showNotification('Server error! Please try again.', 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

// ── Contact Form ──
async function handleContactForm(e) {
  e.preventDefault();

  const name    = document.getElementById('contactName').value;
  const email   = document.getElementById('contactEmail').value;
  const company = document.getElementById('contactCompany').value;
  const message = document.getElementById('contactMessage').value;

  // Honeypot: ha a rejtett mezőt kitöltötték, bot — csendben eldobjuk
  const gotcha = document.getElementById('contactGotcha')?.value;
  if (gotcha) {
    document.getElementById('contactForm').reset();
    return;
  }

  const submitBtn = document.querySelector('.contact-submit-btn');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;

  try {
    const response = await fetch('https://formspree.io/f/mkgppand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, company, message, _replyto: email }),
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

// ── Scroll Spy — aktív nav link kiemelése görgetéskor ──
function initScrollSpy() {
  const sections = document.querySelectorAll('.page-section[id]');
  const navLinks = document.querySelectorAll('.header-nav .nav-link');
  if (!sections.length || !navLinks.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, {
    rootMargin: '-68px 0px -55% 0px',
    threshold: 0,
  });

  sections.forEach(s => observer.observe(s));
}

// ── Mobile Menu ──
function initMobileMenu() {
  const hamburger = document.querySelector('.hamburger-menu');
  const overlay   = document.querySelector('.mobile-menu-overlay');
  const closeBtn  = document.querySelector('.mobile-menu-close');

  if (!hamburger || !overlay) return;

  function closeMenu() {
    hamburger.classList.remove('active');
    overlay.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', () => {
    const open = overlay.classList.toggle('active');
    hamburger.classList.toggle('active', open);
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  });

  closeBtn?.addEventListener('click', closeMenu);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeMenu();
  });

  document.querySelectorAll('.mobile-menu-link').forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

// ── Használati útmutató lenyitása (telefon) ──
function initStepsToggle() {
  const btn = document.getElementById('stepsToggle');
  const list = document.getElementById('stepsList');
  if (!btn || !list) return;
  const label = btn.querySelector('.steps-toggle-label');

  btn.addEventListener('click', () => {
    const expanded = !list.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const key = expanded ? 'steps-toggle-hide' : 'steps-toggle-show';
    if (label) {
      label.setAttribute('data-lang', key);
      if (typeof translations !== 'undefined' && typeof currentLang !== 'undefined'
          && translations[currentLang] && translations[currentLang][key]) {
        label.textContent = translations[currentLang][key];
      }
    }
  });
}

// ── Sticky mobil CTA sáv — elrejtés, amikor az árajánlat szekció látszik ──
function initMobileCtaBar() {
  const bar = document.getElementById('mobileCtaBar');
  const target = document.getElementById('arajanlat');
  if (!bar || !target) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      bar.classList.toggle('is-hidden', entry.isIntersecting);
    });
  }, {
    rootMargin: '0px 0px -20% 0px',
    threshold: 0,
  });

  observer.observe(target);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Login modal triggers
  document.getElementById('openLoginBtn')?.addEventListener('click', openLoginModal);
  document.getElementById('loginModalClose')?.addEventListener('click', closeLoginModal);
  document.getElementById('loginModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLoginModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLoginModal();
  });
  // Mobil: a login modalból az árajánlat űrlaphoz irányítunk
  document.getElementById('loginQuoteLink')?.addEventListener('click', closeLoginModal);

  // Label counter
  const counterElement = document.getElementById('totalLabelCount');
  if (counterElement) counterElement.textContent = '0';
  loadTotalLabelCount();

  // Forms
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('contactForm')?.addEventListener('submit', handleContactForm);

  // Mobile menu
  initMobileMenu();

  // Scroll spy
  initScrollSpy();

  // Használati útmutató lenyitása (telefon)
  initStepsToggle();

  // Sticky mobil CTA sáv
  initMobileCtaBar();

  // Zoom into cursor on labels preview image (desktop only)
  if (window.matchMedia('(hover: hover)').matches) {
    const previewImg = document.querySelector('.label-preview-card img[src*="labels.jpg"]');
    if (previewImg) {
      previewImg.addEventListener('mousemove', e => {
        const { left, top, width, height } = previewImg.getBoundingClientRect();
        const x = ((e.clientX - left) / width) * 100;
        const y = ((e.clientY - top) / height) * 100;
        previewImg.style.transformOrigin = `${x}% ${y}%`;
      });
      previewImg.addEventListener('mouseleave', () => {
        previewImg.style.transformOrigin = '50% 50%';
      });
    }
  }
});
