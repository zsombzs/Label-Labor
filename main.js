const form = document.getElementById("loginForm");

// FONTOS: Cseréld ki a valódi Railway URL-re!
// Railway dashboard-ban: Settings -> Networking -> Public Networking
const API_URL = "https://labelgenerator-production.up.railway.app"; // <-- IDE A VALÓDI URL!

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  // Loading state
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Bejelentkezés...";
  submitBtn.disabled = true;

  try {
    console.log("Próbálkozás:", `${API_URL}/api/login`); // Debug log

    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    console.log("Response status:", res.status); // Debug log

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Server error:", errorText);
      alert("Hibás belépési adatok!");
      return;
    }

    const data = await res.json();
    console.log("Login successful:", data); // Debug log
    
    // Átirányítás
    window.location.href = data.redirect_url;
    
  } catch (err) {
    console.error("Hiba a bejelentkezésnél:", err);
    alert("Szerverhiba! Ellenőrizd a konzolt a részletekért.");
  } finally {
    // Reset button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});