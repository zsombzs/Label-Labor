// Language translations
const translations = {
    en: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'Label Labor is currently only available on desktop/laptop.<br>If using a computer, please increase the window size!',
      'about': 'About us',
      'nav-login': 'Login',
      'what-is': 'What is Label Labor?',
      'demo-labels': 'Demo Labels',
      'contact-request': 'Request a Quote',
      'back-login': '← Back to Login',
      'login': 'Login',
      'username': 'Username',
      'password': 'Password',
      'all-labels': 'All generated labels: ',
      'demo-video': 'Tutorial Videos',
      'user-guide': 'User Guide',
      'step1-title': 'Login',
      'step1-desc': 'Log in to the main page using the provided username and password.',
      'step2-title': 'Download Template Excel File',
      'step2-desc': 'Download the template Excel file by clicking the "Download Template Excel" button. After opening the Excel file, you must enable macros. In case of problems: info@labellabor.com',
      'step3-title': 'Fill in Template Excel Cells',
      'step3-desc': 'Copy the appropriate data into the <span style="color: red;">red</span> columns (max approx. 350 rows), ensuring there are no unnecessary rows (inside and outside cells) or line breaks. In the "Packaging" column, the quantity and unit should be separated by a space, e.g., "1 kg" or "400 ml". For piece packaging, the correct format is: "pcs". For the "Price" column, you don\'t need to write "Ft" or "forint", the correct format is e.g., "999". After checking the pasted data, run the macro named "Adatok_rendszerezese", which will help the program to fill in the cells found in the <span style="color: #378eff;">blue</span> columns.',
      'step4-title': 'Check/Modify Cell Contents',
      'step4-desc': 'The cells in the <span style="color: #378eff;">blue</span> columns can also be manually modified where necessary. After checking all the data, save the file.',
      'step5-title': 'Upload Excel File, Select Label Type',
      'step5-desc': 'By clicking the "Upload Excel File (.xlsm)" button, upload the previously edited Excel template file. Then, if there are multiple label types, select the appropriate one.',
      'step6-title': 'Check Labels, Download PDF',
      'step6-desc': 'After checking the data on the labels, click the "Download PDF" button to download the labels.pdf file. You can follow this process with the "Downloading PDF..." bar. If you want to generate new labels, make sure to refresh the page first.',
      'step7-title': 'Printing the labels',
      'step7-desc': 'Printing the labels.pdf file with any standard printer (for example, the kind used for printing invoices).',
      'contact-footer': 'Contact: info@labellabor.com',
      'contact': 'Contact us',
      
      // About page
      'about-title': 'Welcome to Label Labor!',
      'about-intro': 'In most of the stores, creating uniform shelf labels quickly and efficiently can be a real challenge.<br>Label Labor provides an easy solution: generate and print labels directly from a simple Excel spreadsheet.',
      'about-benefits-title': 'Benefits of using Label Labor:',
      'about-benefit-1': 'Hundreds of labels in just minutes',
      'about-benefit-2': 'Saving time and money on label creation',
      'about-benefit-3': 'Labels that can be printed on regular A4 paper — no need to buy expensive adhesive labels',
      'about-benefit-4': 'Printing labels even with a regular invoice printer — no special label printer required',
      'about-benefit-5': 'Personalized label formats',
      'about-benefit-6': 'Online support for introduction and usage',
      
      // Contact form
      'contact-form-title': 'Request a Personalized Quote!',
      'contact-name': 'Full Name',
      'contact-email': 'Email Address',
      'contact-company': 'Company Name',
      'contact-message': 'Message',
      'contact-submit': 'Send Request',
      'contact-success': 'Your request has been sent successfully!',
    'contact-error': 'An error occurred while sending the quote request. Please try again.',
    'login-success': 'Login successful! Redirecting...',
    'login-error': 'Invalid username or password!',
    'contact-subtitle-1': 'Pricing and Information',
    'contact-text-1': 'Custom-designed interface and label format for your company, with training included. Additional label formats can be provided upon request.',
    'contact-text-2': 'Afterwards, a monthly fee covers maintenance, bug fixes, and implementation of small modification requests.',
    'contact-subtitle-2': 'Helpful Information for us',
    'contact-text-3': 'Please provide the following information in the "Message" field:',
    'contact-benefit-1': 'How many different label sizes would you like to generate on the page',
    'contact-benefit-2': 'Within a given label size, how many different label layouts would you like to use',
    'contact-benefit-3': 'Number of logos you want to use on the various labels',
    'contact-benefit-4': 'Number of stores where you will use Label Labor',

    },
    hu: {
      'desktop-only': 'Desktop Only',
      'desktop-warning': 'A Label Labor jelenleg csak asztali számítógépen/laptopon érhető el.<br>Ha számítógépen használja, növelje az ablak méretét!',
      'about': 'Bemutatkozás',
      'nav-login': 'Bejelentkezés',
      'what-is': 'Mi az a Label Labor?',
      'demo-labels': 'Példa címkék',
      'contact-request': 'Árajánlat',
      'back-login': '← Vissza a bejelentkezéshez',
      'login': 'Bejelentkezés',
      'username': 'Felhasználónév',
      'password': 'Jelszó',
      'all-labels': 'Összes generált címke: ',
      'demo-video': 'Bemutató videók',
      'user-guide': 'Használati útmutató',
      'step1-title': 'Bejelentkezés',
      'step1-desc': 'A kapott felhasználónévvel (username) és jelszóval (password) jelentkezzen be a főoldalon.',
      'step2-title': 'Sablon excel fájl letöltése',
      'step2-desc': 'Töltse le a sablon excel fájlt a "Sablon Excel letöltése" gombra kattintva. Az excel megnyitása után engedélyezze a makrókat. Probléma esetén: info@labellabor.com',
      'step3-title': 'Sablon Excel celláinak kitöltése',
      'step3-desc': 'A <span style="color: red;">piros</span> oszlopokba kell bemásolni a megfelelő adatokat (max kb. 350 sor) úgy, hogy a bemásolt adatoknál ne legyenek felesleges sorok (cellákon belül és kívül) és sorközök. A "Kiszerelés" oszlopban a mennyiség és a mértékegység legyen szóközzel elválasztva, pl. "1 kg" vagy "400 ml". Darabos kiszerelés esetén a helyes formátum: "db". Az "Ár" oszlopnál nem kell odaírni, hogy "Ft" vagy "forint", a helyes formátum pl. "999". A bemásolt adatok leellenőrzése után le kell futtatni az "Adatok_rendszerezese" nevű makrót, amely segítségével a program ki fogja tölteni a <span style="color: #378eff;">kék</span> oszlopokban található cellákat.',
      'step4-title': 'Cellák tartalmának ellenőrzése/módosítása',
      'step4-desc': 'A <span style="color: #378eff;">kék</span> oszlopokban található cellákat is lehet kézzel módosítani, ahol szükséges. Az összes adat leellenőrzése után le kell menteni a fájlt.',
      'step5-title': 'Excel fájl feltöltése, címketípus kiválasztása',
      'step5-desc': 'Az "Excel fájl feltöltése (.xlsm)" gombra kattintva fel kell tölteni az előbb megszerkesztett excel sablon fájlt. Ezután ha több féle címketípus van, akkor ki kell választani a megfelelőt.',
      'step6-title': 'Címkék ellenőrzése, PDF letöltése',
      'step6-desc': 'A Címkén lévő adatok ellenőrzése után a "PDF letöltése" gombra kattintva le kell tölteni a cimkek.pdf fájlt, ezt a "Downloading PDF..." bár segítségével követhetjük végig. Ha újabb címkéket szeretne generálni, akkor előtte mindenképpen frissítsen rá az oldalra.',
      'step7-title': 'Címkék nyomtatása',
      'step7-desc': 'A cimkek.pdf fájlt bármilyen hagyományos nyomtatóval (például amivel a számlákat is nyomtatjuk) ki lehet nyomtatni.',
      'contact-footer': 'Kontakt: info@labellabor.com',
      'contact': 'Kapcsolat',
      
      // About page
      'about-title': 'Üdvözöllek a Label Labor oldalán!',
      'about-intro': 'A legtöbb boltban problémát jelent a polcsínbe való címkék gyors, költséghatékony és egységes előállítása.<br>A Label Labor erre kínál egyszerű megoldást: néhány kattintással készíthet és nyomtathat címkéket egyszerű Excel táblázatból.',
      'about-benefits-title': 'A Label Labor használatának előnyei:',
      'about-benefit-1': 'Több 100 címke percek alatt',
      'about-benefit-2': 'Időt és pénzt tud spórolni a címkék előállításán',
      'about-benefit-3': 'Hagyományos A4-es lapra is nyomtatható címkék, nem kell drága öntapadós címkét vásárolni',
      'about-benefit-4': 'Egyszerű számlanyomtatásra használt nyomtatóval is lehet címkét nyomtatni, nem szükséges speciális címkenyomtató',
      'about-benefit-5': 'Egyedi, személyre szabott címkeformátum',
      'about-benefit-6': 'Online támogatás a bevezetés és használat során',
      
      // Contact form
      'contact-form-title': 'Kérjen személyre szabott árajánlatot!',
      'contact-name': 'Név',
      'contact-email': 'Email cím',
      'contact-company': 'Cég neve',
      'contact-message': 'Üzenet',
      'contact-submit': 'Küldés',
      'contact-success': 'Árajánlat sikeresen elküldve!',
      'contact-error': 'Hiba történt az árajánlat küldésekor. Kérjük, próbálja újra.',
      'login-success': 'Sikeres bejelentkezés! Átirányítás...',
      'login-error': 'Hibás felhasználónév vagy jelszó!',
      'contact-subtitle-1': 'Árképzés és információk',
      'contact-text-1': 'A cégének egyedileg elkészített felület és címkeformátum, betanítás. Több címkeformátum kérés esetén.',
      'contact-text-2': 'Ezt követően havi díj ellenében biztosítjuk a karbantartást, hibajavítást és kisebb módosítási kérések teljesítését.',
      'contact-subtitle-2': 'Nekünk hasznos információk',
      'contact-text-3': 'Kérjük adja meg az alábbi információkat az "Üzenet" mezőbe:',
      'contact-benefit-1': 'Hány féle méretű címkét szeretne generálni az oldalon',
      'contact-benefit-2': 'Egy adott címkeméreten belül hány féle elrendezésű címkét szeretne használni',
      'contact-benefit-3': 'Felhasználni kívánt logók mennyisége a különböző címkéken',
      'contact-benefit-4': 'Boltjainak száma, ahol használná a Label Labort',

    }
  };
  
  // Get current language from localStorage or default to 'hu'
  let currentLang = localStorage.getItem('language') || 'hu';
  
  
  function changeLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('language', lang);
    
    document.querySelectorAll('[data-lang]').forEach(element => {
      const key = element.getAttribute('data-lang');
      if (translations[lang][key]) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          element.placeholder = translations[lang][key];
        } else {
          
          if (key === 'all-labels') {
            const statsNumber = element.querySelector('.stats-number');
            if (statsNumber) {
              const numberValue = statsNumber.textContent;
              // Update text but preserve the counter element
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = translations[lang][key];
              const textContent = tempDiv.textContent;

              // Only update if not animating, or update text but keep number element
              if (typeof isCounterAnimating !== 'undefined' && isCounterAnimating) {
                // Keep the existing counter element during animation
                element.childNodes.forEach(node => {
                  if (node.nodeType === Node.TEXT_NODE) {
                    node.textContent = textContent;
                  }
                });
              } else {
                element.innerHTML = translations[lang][key] + '<span class="stats-number" id="totalLabelCount">' + numberValue + '</span>';
              }
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