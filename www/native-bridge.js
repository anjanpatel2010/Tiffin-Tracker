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

      // Configure Native Firebase Cloud Messaging (FCM) Push Notifications
      if (PushNotifications) {
        try {
          PushNotifications.addListener('registration', (token) => {
            console.log('[NativeBridge] FCM Token registered:', token.value);
            localStorage.setItem('tiffin_fcm_token', token.value);
            if (window.FirebaseSync && typeof window.FirebaseSync.registerFcmToken === 'function') {
              window.FirebaseSync.registerFcmToken(token.value);
            }
          });

          PushNotifications.addListener('registrationError', (error) => {
            console.warn('[NativeBridge] FCM registration error:', error);
          });

          // Incoming notification when app is in foreground
          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('[NativeBridge] Foreground Push received:', notification);
            if (typeof showToast === 'function') {
              showToast(notification.title || 'New flatmate alert!');
            }
            if (typeof playJoinAlertChime === 'function') {
              playJoinAlertChime();
            }
          });

          // User tapped notification in system tray (even if app was closed!)
          PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            console.log('[NativeBridge] Push action performed:', action);
            const data = action.notification.data || {};
            const targetUrl = data.url || data.click_action || '#view-poll';
            window.location.hash = targetUrl;
            if (typeof renderPollView === 'function') {
              renderPollView();
            }
          });

          // Auto-register if permission was already granted
          PushNotifications.checkPermissions().then(perm => {
            if (perm.receive === 'granted') {
              PushNotifications.register();
            }
          }).catch(() => {});
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
    },

    // Schedule native background reminders for polls (runs even when app is killed)
    async schedulePollReminders(poll) {
      if (!isNative() || !poll || !poll.id) return;
      const { LocalNotifications } = getPlugins();
      if (!LocalNotifications) return;

      try {
        const hasPerm = await this.checkNotificationPermission();
        if (!hasPerm) return;

        // Cancel any existing reminder alarms first
        await this.cancelPollReminders();

        const meal = poll.mealSlot || 'Dinner';
        const optionsStr = (poll.options || []).slice(0, 3).join(' vs ');
        const notifications = [];

        // Schedule alarms for every 5 min up to 30 mins (runs even if app process is killed)
        for (let i = 1; i <= 6; i++) {
          const delayMs = i * 5 * 60 * 1000;
          notifications.push({
            id: 9100 + i,
            title: `⏰ Reminder (${i * 5}m): ${meal} Poll`,
            body: `Cast your vote! Options: ${optionsStr}`,
            smallIcon: 'ic_launcher',
            iconColor: '#00f5a0',
            sound: null,
            schedule: { at: new Date(Date.now() + delayMs) },
            extra: { pollId: poll.id, type: 'poll-reminder' }
          });
        }

        await LocalNotifications.schedule({ notifications });
        console.log(`[NativeBridge] Scheduled ${notifications.length} native alarms for poll ${poll.id}`);
      } catch (e) {
        console.warn('[NativeBridge] schedulePollReminders failed:', e);
      }
    },

    // Cancel native background reminder alarms
    async cancelPollReminders() {
      if (!isNative()) return;
      const { LocalNotifications } = getPlugins();
      if (!LocalNotifications) return;

      try {
        const cancelList = [];
        for (let i = 1; i <= 6; i++) {
          cancelList.push({ id: 9100 + i });
        }
        await LocalNotifications.cancel({ notifications: cancelList });
        console.log('[NativeBridge] Cancelled native poll reminder alarms');
      } catch (e) {
        console.warn('[NativeBridge] cancelPollReminders failed:', e);
      }
    }
  };

  window.NativeBridge = NativeBridge;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NativeBridge.init());
  } else {
    NativeBridge.init();
  }
})();
