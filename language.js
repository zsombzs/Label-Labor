// Language translations
const translations = {
    en: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'Label Labor is currently only available on desktop/laptop.<br>If using a computer, please increase the window size!',
      'what-is': 'What is Label Labor?',
      'back-login': '← Back to Login',
      'login': 'Login',
      'all-labels': 'All generated labels: ',
      'demo-video': 'Demo Video',
      'user-guide': 'User Guide',
      'step1-title': 'Login',
      'step1-desc': 'Log in to the main page using the provided username and password.',
      'step2-title': 'Download Template Excel File',
      'step2-desc': 'Download the template Excel file by clicking the "Download Template Excel" button. After opening the Excel file, you must enable macros. In case of problems: info@labellabor.com',
      'step3-title': 'Fill in Template Excel Cells',
      'step3-desc': 'Copy the appropriate data into the <span style="color: red;">red</span> columns (max approx. 350 rows), ensuring there are no unnecessary rows (inside and outside cells) or line breaks. In the "Packaging" column, the quantity and unit should be separated by a space, e.g., "1 kg" or "400 ml". For piece packaging, the correct format is: "pcs". For the "Price" column, you don\'t need to write "Ft" or "forint", the correct format is e.g., "999". After checking the pasted data, run the macro named "Adatok_rendszerezese", which will help the program fill in the cells found in the <span style="color: #378eff;">blue</span> columns.',
      'step4-title': 'Check/Modify Cell Contents',
      'step4-desc': 'The cells in the <span style="color: #378eff;">blue</span> columns can also be manually modified where necessary. After checking all the data, save the file.',
      'step5-title': 'Upload Excel File, Select Label Type',
      'step5-desc': 'By clicking the "Upload Excel File (.xlsm)" button, upload the previously edited Excel template file. Then, if there are multiple label types, select the appropriate one.',
      'step6-title': 'Check Labels, Download PDF',
      'step6-desc': 'After checking the data on the labels, click the "Download PDF" button to download the labels.pdf file. You can follow this process with the "Downloading PDF..." bar. If you want to generate new labels, make sure to refresh the page first.',
      'contact': 'Contact: info@labellabor.com'
    },
    hu: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'A Label Labor jelenleg csak asztali számítógépen/laptopon érhető el.<br>Ha számítógépen használja, növelje az ablak méretét!',
      'what-is': 'Mi az a Label Labor?',
      'back-login': '← Vissza a bejelentkezéshez',
      'login': 'Bejelentkezés',
      'all-labels': 'Összes generált címke: ',
      'demo-video': 'Bemutató videó',
      'user-guide': 'Használati útmutató',
      'step1-title': 'Bejelentkezés',
      'step1-desc': 'A kapott felhasználónévvel (username) és jelszóval (password) be kell jelentkezni a főoldalon.',
      'step2-title': 'Sablon excel fájl letöltése',
      'step2-desc': 'Töltse le a sablon excel fájlt a "Sablon Excel letöltése" gombra kattintva. Az excel megnyitása után engedélyezni kell a makrókat. Probléma esetén: info@labellabor.com',
      'step3-title': 'Sablon Excel celláinak kitöltése',
      'step3-desc': 'A <span style="color: red;">piros</span> oszlopokba kell bemásolni a megfelelő adatokat (max kb. 350 sor) úgy, hogy a bemásolt adatoknál ne legyenek felesleges sorok (cellákon belül és kívül) és sorközök. A "Kiszerelés" oszlopban a mennyiség és a mértékegység legyen szóközzel elválasztva, pl. "1 kg" vagy "400 ml". Darabos kiszerelés esetén a helyes formátum: "db". Az "Ár" oszlopnál nem kell odaírni, hogy "Ft" vagy "forint", a helyes formátum pl. "999". A bemásolt adatok leellenőrzése után le kell futtatni az "Adatok_rendszerezese" nevű makrót, amely segítségével a program ki fogja tölteni a <span style="color: #378eff;">kék</span> oszlopokban található cellákat.',
      'step4-title': 'Cellák tartalmának ellenőrzése/módosítása',
      'step4-desc': 'A <span style="color: #378eff;">kék</span> oszlopokban található cellákat is lehet kézzel módosítani, ahol szükséges. Az összes adat leellenőrzése után le kell menteni a fájlt.',
      'step5-title': 'Excel fájl feltöltése, címketípus kiválasztása',
      'step5-desc': 'Az "Excel fájl feltöltése (.xlsm)" gombra kattintva fel kell tölteni az előbb megszerkesztett excel sablon fájlt. Ezután ha több féle címketípus van, akkor ki kell választani a megfelelőt.',
      'step6-title': 'Címkék ellenőrzése, PDF letöltése',
      'step6-desc': 'A Címkén lévő adatok ellenőrzése után a "PDF letöltése" gombra kattintva le kell tölteni a cimkek.pdf fájlt, ezt a "Downloading PDF..." bár segítségével követhetjük végig. Ha újabb címkéket szeretne generálni, akkor előtte mindenképpen frissítsen rá az oldalra.',
      'contact': 'Kontakt: info@labellabor.com'
    }
  };
  
  // Get current language from localStorage or default to 'en'
  let currentLang = localStorage.getItem('language') || 'en';
  
  
  function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    
    document.querySelectorAll('[data-lang]').forEach(element => {
      const key = element.getAttribute('data-lang');
      if (translations[lang][key]) {
        if (element.tagName === 'INPUT') {
          element.placeholder = translations[lang][key];
        } else {
          
          if (key === 'all-labels') {
            const statsNumber = element.querySelector('.stats-number');
            if (statsNumber) {
              const numberValue = statsNumber.textContent;
              element.innerHTML = translations[lang][key] + '<span class="stats-number" id="totalLabelCount">' + numberValue + '</span>';
            } else {
              element.innerHTML = translations[lang][key];
            }
          } else {
            element.innerHTML = translations[lang][key];
          }
        }
      }
    });
    
   
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.getAttribute('data-lang-code') === lang) {
        btn.classList.add('active');
      }
    });
    
    
    document.documentElement.lang = lang;
  }
  
  
  document.addEventListener('DOMContentLoaded', () => {
    changeLanguage(currentLang);
    
    
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang-code');
        changeLanguage(lang);
      });
    });
  });