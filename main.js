const form = document.getElementById("loginForm");

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
    console.error("Hiba a címkeszám betöltésekor:", error);
  }
}

function updateCounterDisplay(count) {
  const counterElement = document.getElementById("totalLabelCount");
  if (counterElement) {
    // Animált számláló effekt
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

// Oldal betöltésekor frissítjük a számlálót
document.addEventListener("DOMContentLoaded", () => {
  loadTotalLabelCount();
  
  // 30 másodpercenként frissítjük
  setInterval(loadTotalLabelCount, 30000);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Login...";
  submitBtn.disabled = true;

  try {
    console.log("Próbálkozás:", `${API_URL}/api/login`);

    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    console.log("Response status:", res.status);

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Server error:", errorText);
      showNotification("Hibás felhasználónév vagy jelszó!", 'error');
      return;
    }

    const data = await res.json();
    console.log("Login successful:", data);
    
    // Eltároljuk a felhasználónevet a sessionStorage-ban
    sessionStorage.setItem('currentUsername', username);
    
    showNotification("Sikeres bejelentkezés! Átirányítás...", 'success');
    
    setTimeout(() => {
      window.location.href = data.redirect_url;
    }, 1500);
    
  } catch (err) {
    console.error("Hiba a bejelentkezésnél:", err);
    showNotification("Szerverhiba! Kérlek próbáld újra.", 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});