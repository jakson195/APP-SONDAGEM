import { useEffect, useState } from "react";

import { fetchNotifications } from "../api/alerts";

type Props = {
  projectId: string | null;
  onClick?: () => void;
};

export function GeotechAlertsBell({ projectId, onClick }: Props) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!projectId) {
      setUnread(0);
      return;
    }
    const load = () => {
      fetchNotifications(projectId, true)
        .then((r) => setUnread(r.unread_count))
        .catch(() => setUnread(0));
    };
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [projectId]);

  if (!projectId) return null;

  return (
    <button
      type="button"
      className="alerts-bell"
      title="Notificações geotécnicas"
      onClick={onClick}
    >
      🔔
      {unread > 0 && <span className="alerts-bell-count">{unread}</span>}
    </button>
  );
}
