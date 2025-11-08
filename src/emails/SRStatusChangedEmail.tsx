import * as React from "react";

interface SRStatusChangedEmailProps {
  srNumber: string;
  title: string;
  fromStatus: string;
  toStatus: string;
  changeReason?: string;
  changedByName: string;
  clientName: string;
  srUrl: string;
}

const statusLabels: Record<string, string> = {
  REQUESTED: "요청됨",
  INTAKE: "접수",
  IN_PROGRESS: "진행중",
  ON_HOLD: "대기",
  COMPLETED: "완료",
  CONFIRMED: "확인완료",
  REJECTED: "거부",
};

const statusColors: Record<string, string> = {
  REQUESTED: "#6b7280",
  INTAKE: "#2563eb",
  IN_PROGRESS: "#0891b2",
  ON_HOLD: "#f59e0b",
  COMPLETED: "#10b981",
  CONFIRMED: "#059669",
  REJECTED: "#dc2626",
};

export default function SRStatusChangedEmail({
  srNumber,
  title,
  fromStatus,
  toStatus,
  changeReason,
  changedByName,
  clientName,
  srUrl,
}: SRStatusChangedEmailProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ background: "#0891b2", color: "white", padding: "20px", borderRadius: "8px 8px 0 0" }}>
        <h1 style={{ margin: 0, fontSize: "24px" }}>SR 상태가 변경되었습니다</h1>
      </div>

      <div style={{ background: "#ffffff", padding: "30px", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>
            {srNumber}
          </h2>
          <p style={{ margin: 0, fontSize: "16px", color: "#4b5563" }}>{title}</p>
        </div>

        <div style={{ background: "#f9fafb", padding: "20px", borderRadius: "6px", marginBottom: "20px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "8px 0", color: "#6b7280", width: "120px" }}>고객사</td>
                <td style={{ padding: "8px 0", color: "#1f2937", fontWeight: "500" }}>{clientName}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "#6b7280" }}>변경자</td>
                <td style={{ padding: "8px 0", color: "#1f2937", fontWeight: "500" }}>{changedByName}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ margin: "0 0 15px 0", fontSize: "16px", color: "#1f2937" }}>상태 변경</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                background: statusColors[fromStatus] || "#6b7280",
                color: "white",
              }}
            >
              {statusLabels[fromStatus] || fromStatus}
            </span>
            <span style={{ color: "#6b7280", fontSize: "20px" }}>→</span>
            <span
              style={{
                display: "inline-block",
                padding: "8px 16px",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                background: statusColors[toStatus] || "#6b7280",
                color: "white",
              }}
            >
              {statusLabels[toStatus] || toStatus}
            </span>
          </div>
        </div>

        {changeReason && (
          <div style={{ marginBottom: "30px" }}>
            <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#1f2937" }}>변경 사유</h3>
            <div
              style={{
                background: "#f9fafb",
                padding: "15px",
                borderRadius: "6px",
                borderLeft: "3px solid #0891b2",
              }}
            >
              <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#4b5563", lineHeight: "1.6" }}>
                {changeReason}
              </p>
            </div>
          </div>
        )}

        <a
          href={srUrl}
          style={{
            display: "inline-block",
            background: "#0891b2",
            color: "white",
            padding: "12px 24px",
            textDecoration: "none",
            borderRadius: "6px",
            fontWeight: "500",
          }}
        >
          SR 확인하기
        </a>
      </div>

      <div style={{ textAlign: "center", padding: "20px", color: "#6b7280", fontSize: "14px" }}>
        <p style={{ margin: 0 }}>SR Management System</p>
      </div>
    </div>
  );
}
