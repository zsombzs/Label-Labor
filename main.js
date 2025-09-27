const form = document.getElementById("loginForm");

const API_URL = "https://labelgenerator-production.up.railway.app";

// Custom notification function
function showNotification(message, type = 'error') {
  // Remove existing notifications
  const existing = document.querySelector('.custom-notification');
  if (existing) existing.remove();

  // Create notification element
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

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);

  // Slide in animation
  setTimeout(() => notification.classList.add('show'), 10);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  // Loading state
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
    
    showNotification("Sikeres bejelentkezés! Átirányítás...", 'success');
    
    // Short delay before redirect for user feedback
    setTimeout(() => {
      window.location.href = data.redirect_url;
    }, 1500);
    
  } catch (err) {
    console.error("Hiba a bejelentkezésnél:", err);
    showNotification("Szerverhiba! Kérlek próbáld újra.", 'error');
  } finally {
    // Reset button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});