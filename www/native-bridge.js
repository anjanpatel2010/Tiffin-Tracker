/**
 * Native Bridge for Tiffin Tracker
 * Enhances Android APK with true native device capabilities:
 * - Status bar integration & notch / cutout awareness
 * - Native Android 13+ runtime notification permissions
 * - Hardware / gesture Back Button navigation (modal stack dismissal)
 * - Tactile haptic feedback on interactions
 * - Android Local Notification dispatching
 */
(function () {
  'use strict';

  const isNative = () => {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  };

  const getPlugins = () => {
    return window.Capacitor?.Plugins || {};
  };

  const NativeBridge = {
    isNative: isNative(),

    async init() {
      if (!isNative()) {
        console.log('[NativeBridge] Running in standard web context.');
        return;
      }

      console.log('[NativeBridge] Initializing native Android environment...');
      document.body.classList.add('is-native-android');
      document.documentElement.classList.add('is-native-android');
      if (!document.documentElement.style.getPropertyValue('--safe-area-top')) {
        document.documentElement.style.setProperty('--safe-area-top', '44px');
        document.documentElement.style.setProperty('--safe-area-bottom', '24px');
      }

      const { StatusBar, SplashScreen, App, LocalNotifications, PushNotifications } = getPlugins();

      // Configure Official Native Firebase Cloud Messaging (FCM) via Capacitor
      if (PushNotifications) {
        try {
          // 1. Create high-importance notification channel for Android 8.0+
          if (typeof PushNotifications.createChannel === 'function') {
            PushNotifications.createChannel({
              id: 'tiffin_notifications',
              name: 'Tiffin Tracker Notifications',
              description: 'Real-time flat notifications, meal alerts, and ledger updates',
              importance: 5, // IMPORTANCE_HIGH (Heads-up popups on screen)
              visibility: 1, // VISIBILITY_PUBLIC (Visible on lock screen)
              sound: 'default',
              vibration: true,
              lights: true,
              lightColor: '#00f5a0'
            }).then(() => {
              console.log('[NativeBridge] FCM Notification Channel "tiffin_notifications" confirmed.');
            }).catch(chErr => {
              console.warn('[NativeBridge] Notification channel creation warning:', chErr);
            });
          }

          // 2. Listen for FCM Device Registration Token
          PushNotifications.addListener('registration', (token) => {
            console.log('[NativeBridge] FCM Token registered:', token.value);
            localStorage.setItem('tiffin_fcm_token', token.value);
            if (window.FirebaseSync && typeof window.FirebaseSync.registerFcmToken === 'function') {
              window.FirebaseSync.registerFcmToken(token.value);
            }
          });

          // 3. Listen for Registration Errors
          PushNotifications.addListener('registrationError', (error) => {
            console.warn('[NativeBridge] FCM registration error:', error);
          });

          // 4. Foreground push notification received (app is active on screen)
          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[NativeBridge] Foreground FCM Push received:', notification);
            const title = notification.title || 'Tiffin Tracker Alert 🍱';
            const body = notification.body || '';
            if (typeof window.showToast === 'function') {
              window.showToast(body ? `${title}: ${body}` : title);
            }
            if (typeof window.playJoinAlertChime === 'function') {
              window.playJoinAlertChime();
            }
          });

          // 5. User tapped notification in system tray / notification bar (even if app was closed)
          PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[NativeBridge] FCM Push Action performed:', action);
            const data = action.notification?.data || {};
            const targetUrl = data.actionUrl || data.url || data.click_action || '';
            if (targetUrl) {
              window.location.hash = targetUrl;
            }
            if (data.roomCode && window.FirebaseSync) {
              console.log('[NativeBridge] Notification arrived for room #' + data.roomCode);
            }
          });

          // 6. Check runtime permission and register with FCM
          PushNotifications.checkPermissions().then(async (perm) => {
            if (perm.receive !== 'granted') {
              perm = await PushNotifications.requestPermissions();
            }
            if (perm.receive === 'granted') {
              localStorage.setItem('tiffin_native_notif_granted', 'true');
              await PushNotifications.register();
              console.log('[NativeBridge] FCM PushNotifications registered with Google Play Services.');
            }
          }).catch((e) => {
            console.warn('[NativeBridge] FCM Auto-permission check warning:', e);
          });
        } catch (pushErr) {
          console.warn('[NativeBridge] PushNotifications setup warning:', pushErr);
        }
      }

      // 1. Configure Android Status Bar & edge-to-edge immersion
      if (StatusBar) {
        try {
          await StatusBar.setOverlaysWebView({ overlay: true });
          if (StatusBar.setStyle) {
            await StatusBar.setStyle({ style: 'DARK' });
          }
        } catch (e) {
          console.warn('[NativeBridge] StatusBar setup warning:', e);
        }
      }

      // 2. Hide splash screen smoothly once DOM is ready
      if (SplashScreen) {
        setTimeout(async () => {
          try {
            await SplashScreen.hide({ fadeOutDuration: 300 });
          } catch (e) {}
        }, 600);
      }

      // 3. Hardware Back Button Listener (Native Modal Stack Management)
      if (App) {
        let lastBackPressTime = 0;

        App.addListener('backButton', () => {
          // Check for visible modals (active class or explicit display flex/block)
          const allModals = Array.from(document.querySelectorAll('.modal-backdrop'));
          const visibleModals = allModals.filter(m => {
            const style = window.getComputedStyle(m);
            return (m.classList.contains('active') || style.display === 'flex' || style.display === 'block') && style.display !== 'none';
          });

          if (visibleModals.length > 0) {
            const topModal = visibleModals[visibleModals.length - 1];
            // Look for a close button or dismiss button
            const closeBtn = topModal.querySelector(
              '.modal-close-btn, #updateLaterBtn, #dismissStartNotificationBtn, #closeSettingsBtn, #closeInvoiceModalBtn, button[id*="close"], button[id*="dismiss"], button[id*="cancel"]'
            );
            if (closeBtn && typeof closeBtn.click === 'function') {
              closeBtn.click();
            } else {
              topModal.classList.remove('active');
              topModal.style.display = 'none';
            }
            return;
          }

          // If no modal is open, require double back tap within 2 seconds to exit
          const now = Date.now();
          if (now - lastBackPressTime < 2000) {
            App.exitApp();
          } else {
            lastBackPressTime = now;
            if (typeof window.showToast === 'function') {
              window.showToast('Tap back again to exit Tiffin Tracker', 2000);
            }
          }
        });
      }

      // 4. Check & Request Notification Permission via LocalNotifications plugin
      if (LocalNotifications) {
        try {
          const status = await LocalNotifications.checkPermissions();
          if (status.display !== 'granted') {
            console.log('[NativeBridge] Prompting for Android notification permission...');
            const req = await LocalNotifications.requestPermissions();
            console.log('[NativeBridge] Notification permission result:', req.display);
          }
        } catch (e) {
          console.warn('[NativeBridge] Notification permission check warning:', e);
        }
      }
    },

    // Native Haptic Engine (Disabled per user request)
    async haptic(style = 'light') {
      return;
    },

    // Retrieve cached or registered FCM device token
    getFcmToken() {
      return localStorage.getItem('tiffin_fcm_token') || null;
    },

    // Request Android System Notification & Push Permission
    async requestNotificationPermission() {
      if (isNative()) {
        const { PushNotifications, LocalNotifications } = getPlugins();
        let granted = false;
        if (PushNotifications) {
          try {
            let res = await PushNotifications.checkPermissions();
            if (res.receive !== 'granted') {
              res = await PushNotifications.requestPermissions();
            }
            if (res.receive === 'granted') {
              await PushNotifications.register();
              localStorage.setItem('tiffin_native_notif_granted', 'true');
              granted = true;
            }
          } catch (e) {
            console.warn('[NativeBridge] PushNotifications request error:', e);
          }
        }
        if (LocalNotifications) {
          try {
            const locRes = await LocalNotifications.requestPermissions();
            if (locRes.display === 'granted') granted = true;
          } catch (e) {}
        }
        return granted;
      }

      // Web fallback
      if ('Notification' in window) {
        try {
          const res = await Notification.requestPermission();
          return res === 'granted';
        } catch (e) {}
      }
      return false;
    },

    // Check if notifications are enabled
    async checkNotificationPermission() {
      if (isNative()) {
        const { PushNotifications, LocalNotifications } = getPlugins();
        if (PushNotifications) {
          try {
            const status = await PushNotifications.checkPermissions();
            if (status.receive === 'granted') return true;
          } catch (e) {}
        }
        if (LocalNotifications) {
          try {
            const status = await LocalNotifications.checkPermissions();
            if (status.display === 'granted') return true;
          } catch (e) {}
        }
      }
      return ('Notification' in window) && Notification.permission === 'granted';
    },

    // Dispatch Native Android Notification
    async sendNotification(title, body, tag = 'tiffin-alert') {
      if (isNative()) {
        const { LocalNotifications } = getPlugins();
        if (LocalNotifications) {
          try {
            const hasPerm = await this.checkNotificationPermission();
            if (hasPerm) {
              await LocalNotifications.schedule({
                notifications: [
                  {
                    id: Math.floor(Date.now() % 100000),
                    title: title || 'Tiffin Tracker 🍲',
                    body: body || 'Update from flatmates',
                    smallIcon: 'ic_launcher',
                    iconColor: '#00f5a0',
                    sound: null,
                    schedule: { at: new Date(Date.now() + 100) }
                  }
                ]
              });
              return true;
            }
          } catch (e) {
            console.warn('[NativeBridge] Local notification failed:', e);
          }
        }
      }

      // Web notification fallback
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body: body, tag: tag, icon: 'icon-192.png' });
          return true;
        } catch (e) {}
      }
      return false;
    }
  };

  window.NativeBridge = NativeBridge;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NativeBridge.init());
  } else {
    NativeBridge.init();
  }
})();
