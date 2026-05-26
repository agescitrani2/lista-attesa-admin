const firebaseConfig = {
    apiKey:            "AIzaSyBmxLSavlzV7stjcdp4ji-1khWbdtU7fSQ",
    authDomain:        "lista-dattesa-74a32.firebaseapp.com",
    projectId:         "lista-dattesa-74a32",
    storageBucket:     "lista-dattesa-74a32.firebasestorage.app",
    messagingSenderId: "993258362179",
    appId:             "1:993258362179:web:88b82c6e174c3146418bf6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- Password accesso pannello admin ----
// CAMBIA QUESTA PASSWORD prima di pubblicare!
const ADMIN_PASSWORD = "Trani2Scout!";
