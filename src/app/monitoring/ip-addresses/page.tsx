import { IPMonitoringClient } from "@/components/monitoring/ip-monitoring-client";

export const metadata = {
  title: "IP Address Monitoring - ASCIT",
  description: "Monitor allocation of IP Addresses",
};

export default function IPMonitoringPage() {
  return <IPMonitoringClient />;
}
