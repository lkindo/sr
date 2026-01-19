import * as React from 'react';
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
} from '@react-email/components';

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
  CRITICAL: '긴급',
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
};

export const SRAssignedEmail = ({
  srNumber = 'SR-20251107-0001',
  title = '시스템 오류 수정 요청',
  description = '로그인 시 간헐적으로 오류가 발생합니다.',
  priority = 'HIGH',
  clientName = '테스트 고객사',
  assignedToName = '김개발',
  assignedByName = '이매니저',
  srUrl = 'https://sr.example.com/srs/1',
}: SRAssignedEmailProps) => {
  const previewText = `새로운 SR이 배정되었습니다: ${srNumber}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>새로운 SR이 배정되었습니다</Heading>
          <Text style={text}>
            {assignedToName}님께 새로운 서비스 요청이 배정되었습니다. 아래 내용을 확인하고
            처리해주세요.
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
                  <td style={labelCell}>우선순위</td>
                  <td style={valueCell}>
                    <span
                      style={{
                        ...priorityBadge,
                        ...(priority === 'CRITICAL' || priority === 'HIGH'
                          ? priorityBadgeHigh
                          : {}),
                      }}
                    >
                      {priorityLabels[priority] || priority}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={labelCell}>고객사</td>
                  <td style={valueCell}>{clientName}</td>
                </tr>
                <tr>
                  <td style={labelCell}>배정자</td>
                  <td style={valueCell}>{assignedByName}</td>
                </tr>
              </tbody>
            </table>

            <Hr style={hr} />

            <Text style={descriptionLabel}>설명</Text>
            <Text style={descriptionText}>{description}</Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={srUrl}>
              SR 확인 및 작업 시작
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

export default SRAssignedEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const box = {
  padding: '0 48px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 48px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 48px',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  marginTop: '16px',
};

const labelCell = {
  padding: '12px 16px',
  backgroundColor: '#f9fafb',
  fontWeight: '600',
  color: '#374151',
  width: '30%',
  borderBottom: '1px solid #e5e7eb',
};

const valueCell = {
  padding: '12px 16px',
  color: '#111827',
  borderBottom: '1px solid #e5e7eb',
};

const priorityBadge = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: '500',
  backgroundColor: '#e5e7eb',
  color: '#374151',
};

const priorityBadgeHigh = {
  backgroundColor: '#fee2e2',
  color: '#991b1b',
};

const descriptionLabel = {
  fontWeight: '600',
  color: '#374151',
  marginTop: '24px',
  marginBottom: '8px',
};

const descriptionText = {
  color: '#111827',
  fontSize: '14px',
  lineHeight: '24px',
  whiteSpace: 'pre-wrap' as const,
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const buttonContainer = {
  padding: '27px 48px 0',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '12px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 48px',
};

const link = {
  color: '#2563eb',
  textDecoration: 'underline',
};
