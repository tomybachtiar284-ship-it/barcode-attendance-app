
// Mobile Camera Logic - Standalone Fix
// Ensures global availability and robust error handling

(function () {
    console.log('Mobile Camera Script Loaded');
    let cameraObj = null;
    let isCamOpen = false;

    window.toggleCamera = async function () {
        console.log('Global toggleCamera called');

        // 1. Detect Mobile/Desktop
        const mobView = document.getElementById('mobScanView');
        const isMobile = mobView && getComputedStyle(mobView).display !== 'none';
        const boxId = isMobile ? 'readerMob' : 'reader';
        console.log('Mode:', isMobile ? 'Mobile' : 'Desktop', 'BoxId:', boxId);

        // 2. Elements
        const btnTxtDesktop = document.getElementById('btnCamText');
        const btnMob = document.getElementById('btnCamToggleMob');
        const box = document.getElementById(boxId);

        if (!box) {
            alert('Error Critical: Element kamera (' + boxId + ') tidak ditemukan di HTML.');
            return;
        }

        // 3. Toggle Logic
        if (isCamOpen) {
            // STOP CAMERA
            console.log('Stopping camera...');
            if (cameraObj) {
                try { await cameraObj.stop(); } catch (e) { console.warn('Stop warning:', e); }
                try { cameraObj.clear(); } catch (e) { console.warn('Clear warning:', e); }
            }
            box.style.display = 'none'; // Hide box

            // Reset Buttons
            if (btnTxtDesktop) btnTxtDesktop.textContent = "Buka Kamera";
            if (btnMob) btnMob.innerHTML = "📸 Buka Kamera";

            isCamOpen = false;
            cameraObj = null;
        } else {
            // START CAMERA
            console.log('Starting camera...');

            // Check Library
            if (!window.Html5Qrcode) {
                alert('Error: Library Html5Qrcode belum dimuat. Cek koneksi internet.');
                return;
            }

            box.style.display = 'block'; // Show box
            box.classList.remove('hidden');

            // Update Buttons
            if (btnTxtDesktop) btnTxtDesktop.textContent = "Tutup Kamera";
            if (btnMob) btnMob.innerHTML = "❌ Tutup Kamera";

            try {
                cameraObj = new Html5Qrcode(boxId);

                // Start Scanning
                await cameraObj.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    (txt) => {
                        // SUCCESS CALLBACK
                        if (txt) {
                            console.log('Scan Success:', txt);

                            // Fill Input
                            const inp = isMobile ? document.getElementById('mobScanInput') : document.getElementById('scanInput');
                            if (inp) inp.value = txt;

                            // Call Global Handler if exists
                            if (window.handleScan) {
                                window.handleScan(txt);
                            } else {
                                alert('Scan: ' + txt + ' (Fungsi handleScan tidak ditemukan)');
                            }

                            // Pause to prevent spam
                            if (cameraObj) cameraObj.pause();
                            setTimeout(() => {
                                if (isCamOpen && cameraObj) cameraObj.resume();
                            }, 2000);
                        }
                    },
                    (err) => {
                        // Frame error, ignore
                    }
                );
                isCamOpen = true; // Set flag only on success

            } catch (err) {
                console.error('Camera Start Error:', err);
                alert("Gagal membuka kamera: " + err);

                // Revert State
                isCamOpen = false;
                box.style.display = 'none';
                if (btnTxtDesktop) btnTxtDesktop.textContent = "Buka Kamera";
                if (btnMob) btnMob.innerHTML = "📸 Buka Kamera";
                cameraObj = null;
            }
        }
    };

    // Auto-bind button just in case onclick is missing
    window.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('btnCamToggleMob');
        if (btn) {
            btn.onclick = window.toggleCamera;
            console.log('Button re-bound via script');
        }
    });

})();
