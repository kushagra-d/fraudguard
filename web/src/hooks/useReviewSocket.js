import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// One consumer (DashboardPage) needs this, so a hook - not a Context - is the
// right shape; a Context earns its keep when several far-apart components need
// the same state, which isn't the case here.
export function useReviewSocket(token, { onNewAlert, onReconnect }) {
  // Keep the latest callbacks in refs so the connect effect below doesn't need
  // them as dependencies - putting them in the deps array would tear down and
  // recreate the socket on every render instead of reusing one connection.
  const onNewAlertRef = useRef(onNewAlert);
  const onReconnectRef = useRef(onReconnect);
  onNewAlertRef.current = onNewAlert;
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token } });

    socket.on('new-alert', (payload) => onNewAlertRef.current(payload));
    socket.on('reconnect', () => onReconnectRef.current());

    // Runs on unmount AND whenever `token` changes (logout, or a fresh login) -
    // this is what prevents duplicate connections/listeners piling up under
    // Vite's hot-reload, which re-runs effects without a real unmount.
    return () => {
      socket.off('new-alert');
      socket.off('reconnect');
      socket.disconnect();
    };
  }, [token]);
}
