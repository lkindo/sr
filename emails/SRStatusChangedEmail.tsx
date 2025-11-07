import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
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

export const SRStatusChangedEmail = ({
  srNumber = "SR-20251107-0001",
  title = "시스템 오류 수정 요청",
  fromStatus = "REQUESTED",
  toStatus = "IN_PROGRESS",
  changeReason = "담당자 배정 완료, 작업 시작",
  changedByName = "김개발",
  clientName = "테스트 고객사",
  srUrl = "https://sr.example.com/srs/1",
}: SRStatusChangedEmailProps) => {
  const previewText = `SR ${srNumber} 상태가 변경되었습니다`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>SR 상태가 변경되었습니다</Heading>
          <Text style={text}>
            {srNumber} SR의 상태가 변경되었습니다. 아래 내용을 확인해주세요.
          </Text>

          <Section style={box}>
            <table style={tableStyle}>
              <tbody>
                <tr>
                  <td style={labelCell}>SR 번호</td>
                  <td style={valueCell}>{srNumber}</td>
                </tr>
                <tr>
                  <td style={labelCell}>제목</td>
                  <td style={valueCell}>{title}</td>
                </tr>
                <tr>
                  <td style={labelCell}>고객사</td>
                  <td style={valueCell}>{clientName}</td>
                </tr>
              </tbody>
            </table>

            <Hr style={hr} />

            <Section style={statusChangeSection}>
              <div style={statusChangeContainer}>
                <div style={statusBox}>
                  <Text style={statusLabel}>이전 상태</Text>
                  <Text style={statusValue}>
                    {statusLabels[fromStatus] || fromStatus}
                  </Text>
                </div>
                <div style={arrow}>→</div>
                <div style={statusBox}>
                  <Text style={statusLabel}>변경된 상태</Text>
                  <Text style={{ ...statusValue, ...statusValueNew }}>
                    {statusLabels[toStatus] || toStatus}
                  </Text>
                </div>
              </div>
            </Section>

            {changeReason && (
              <>
                <Hr style={hr} />
                <Text style={descriptionLabel}>변경 사유</Text>
                <Text style={descriptionText}>{changeReason}</Text>
              </>
            )}

            <Hr style={hr} />

            <Text style={changedBy}>변경자: {changedByName}</Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={srUrl}>
              SR 확인하기
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            이 이메일은 SR 관리 시스템에서 자동으로 발송되었습니다.
            <br />
            <Link href={srUrl} style={link}>
              SR 상세 페이지 바로가기
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default SRStatusChangedEmail;

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const box = {
  padding: "0 48px",
};

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0 48px",
};

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 48px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  marginTop: "16px",
};

const labelCell = {
  padding: "12px 16px",
  backgroundColor: "#f9fafb",
  fontWeight: "600",
  color: "#374151",
  width: "30%",
  borderBottom: "1px solid #e5e7eb",
};

const valueCell = {
  padding: "12px 16px",
  color: "#111827",
  borderBottom: "1px solid #e5e7eb",
};

const statusChangeSection = {
  marginTop: "24px",
  marginBottom: "24px",
};

const statusChangeContainer = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "24px",
};

const statusBox = {
  textAlign: "center" as const,
  padding: "16px",
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  minWidth: "150px",
};

const statusLabel = {
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "8px",
};

const statusValue = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#374151",
};

const statusValueNew = {
  color: "#2563eb",
};

const arrow = {
  fontSize: "24px",
  color: "#9ca3af",
};

const descriptionLabel = {
  fontWeight: "600",
  color: "#374151",
  marginTop: "24px",
  marginBottom: "8px",
};

const descriptionText = {
  color: "#111827",
  fontSize: "14px",
  lineHeight: "24px",
  whiteSpace: "pre-wrap" as const,
};

const changedBy = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "16px",
};

const hr = {
  borderColor: "#e6ebf1",
  margin: "20px 0",
};

const buttonContainer = {
  padding: "27px 48px 0",
};

const button = {
  backgroundColor: "#2563eb",
  borderRadius: "5px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  width: "100%",
  padding: "12px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 48px",
};

const link = {
  color: "#2563eb",
  textDecoration: "underline",
};
