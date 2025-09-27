const infoIcon = document.getElementById("infoIcon");
const modal = document.getElementById("infoModal");
const closeBtn = document.querySelector(".close");

infoIcon.onclick = () => {
  modal.style.display = "block";
};

const closeBtnBottom = document.getElementById("closeBtnBottom");

closeBtnBottom.onclick = () => {
  modal.style.display = "none";
};

window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};
