const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("https://myapp.up.railway.app/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      alert("Hibás belépési adatok!");
      return;
    }

    const data = await res.json();
    window.location.href = data.redirect_url; // pl. "/EA/ea.html"
  } catch (err) {
    console.error("Hiba a bejelentkezésnél:", err);
    alert("Szerverhiba!");
  }
});
