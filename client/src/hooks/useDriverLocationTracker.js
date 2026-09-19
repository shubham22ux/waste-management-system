import { useEffect, useRef } from 'react';
import { apiFetch } from '../api';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook that tracks driver position via browser geolocation API
 * and POSTs coordinates to /api/drivers/me/location every 30 seconds.
 * If user denies permission or device is unavailable, falls back silently to simulated position.
 */
export function useDriverLocationTracker() {
  const { user } = useAuth();
  const lastPosRef = useRef({ lat: 12.9716, lng: 77.5946 });

  useEffect(() => {
    if (!user || user.role !== 'driver') return;

    let isMounted = true;

    const postLocation = async (lat, lng) => {
      try {
        await apiFetch('/api/drivers/me/location', {
          method: 'POST',
          body: JSON.stringify({ latitude: lat, longitude: lng })
        });
      } catch (err) {
        // Silent catch: do not disturb driver flow
      }
    };

    const fallbackSimulated = () => {
      // Gently nudge driver position for demo simulation
      const current = lastPosRef.current;
      const deltaLat = (Math.random() - 0.48) * 0.0008;
      const deltaLng = (Math.random() - 0.48) * 0.0008;
      const nextLat = Number((current.lat + deltaLat).toFixed(6));
      const nextLng = Number((current.lng + deltaLng).toFixed(6));
      lastPosRef.current = { lat: nextLat, lng: nextLng };
      postLocation(nextLat, nextLng);
    };

    const sendPositionUpdate = () => {
      if (!('geolocation' in navigator)) {
        fallbackSimulated();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isMounted) return;
          const lat = Number(position.coords.latitude.toFixed(6));
          const lng = Number(position.coords.longitude.toFixed(6));
          lastPosRef.current = { lat, lng };
          postLocation(lat, lng);
        },
        (error) => {
          // If denied, timed out, or unavailable, fall back silently
          if (!isMounted) return;
          fallbackSimulated();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
      );
    };

    // Send initial location update
    sendPositionUpdate();

    // Repeat every 30 seconds
    const timer = setInterval(sendPositionUpdate, 30000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [user]);
}

export default useDriverLocationTracker;
