import * as React from "react";

interface SRAssignedEmailProps {
  srNumber: string;
  title: string;
  description: string;
  priority: string;
  clientName: string;
  assignedToName: string;
  assignedByName: string;
  srUrl: string;
}

const priorityLabels: Record<string, string> = {
  CRITICAL: "긴급",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

const priorityColors: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#2563eb",
  LOW: "#6b7280",
};

export default function SRAssignedEmail({
  srNumber,
  title,
  description,
  priority,
  clientName,
  assignedToName,
  assignedByName,
  srUrl,
}: SRAssignedEmailProps) {
  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ background: "#7c3aed", color: "white", padding: "20px", borderRadius: "8px 8px 0 0" }}>
        <h1 style={{ margin: 0, fontSize: "24px" }}>새로운 SR이 배정되었습니다</h1>
      </div>

      <div style={{ background: "#ffffff", padding: "30px", border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "20px", color: "#1f2937" }}>
            {srNumber}
          </h2>
          <p style={{ margin: 0, fontSize: "16px", color: "#4b5563" }}>{title}</p>
        </div>

        <div style={{ background: "#faf5ff", padding: "15px", borderRadius: "6px", marginBottom: "20px", borderLeft: "3px solid #7c3aed" }}>
          <p style={{ margin: 0, fontSize: "14px", color: "#6b21a8" }}>
            <strong>{assignedToName}</strong>님께 배정되었습니다
          </p>
          <p style={{ margin: "5px 0 0 0", fontSize: "13px", color: "#9333ea" }}>
            배정자: {assignedByName}
          </p>
        </div>

        <div style={{ background: "#f9fafb", padding: "20px", borderRadius: "6px", marginBottom: "20px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "8px 0", color: "#6b7280", width: "120px" }}>고객사</td>
                <td style={{ padding: "8px 0", color: "#1f2937", fontWeight: "500" }}>{clientName}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "#6b7280" }}>담당자</td>
                <td style={{ padding: "8px 0", color: "#1f2937", fontWeight: "500" }}>{assignedToName}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "#6b7280" }}>우선순위</td>
                <td style={{ padding: "8px 0" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 12px",
                      borderRadius: "4px",
                      fontSize: "14px",
                      fontWeight: "500",
                      background: priorityColors[priority] || "#6b7280",
                      color: "white",
                    }}
                  >
                    {priorityLabels[priority] || priority}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginBottom: "30px" }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#1f2937" }}>상세 내용</h3>
          <div
            style={{
              background: "#f9fafb",
              padding: "15px",
              borderRadius: "6px",
              borderLeft: "3px solid #7c3aed",
            }}
          >
            <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#4b5563", lineHeight: "1.6" }}>
              {description}
            </p>
          </div>
        </div>

        <a
          href={srUrl}
          style={{
            display: "inline-block",
            background: "#7c3aed",
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
