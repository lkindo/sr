import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';

import { PWARegistration } from '../PWARegistration';

/**
 * PWA 등록 배너.
 *
 * 이 컴포넌트의 로직은 전부 **환경 판정**이다: 어떤 기기인가(UA), Service Worker 가
 * 있는가, 문서가 이미 로드됐는가, 사용자가 최근에 배너를 닫았는가. 그래서 "렌더되는가"
 * 를 보는 테스트는 아무것도 지키지 못한다 — 판정마다 양쪽 경로를 태운다.
 *
 * 특히 지켜야 하는 계약 두 가지:
 *  - **PC 에서는 아무 일도 일어나지 않아야 한다.** SW 등록도, 설치 배너도 없다.
 *    (`isMobileDevice()` 가 무너지면 데스크톱 사용자에게 설치 배너가 뜬다)
 *  - **닫은 배너는 7일간 다시 뜨지 않는다.** 유예 계산이 무너지면 매 방문마다 배너가
 *    떠서 사용자가 앱을 못 쓴다. 반대로 파싱 실패(손상된 값)가 배너를 영구히 막아서도
 *    안 되므로 NaN·예외 경로도 함께 고정한다.
 *  - **유예 중에는 `preventDefault()` 를 부르지 않는다.** 이건 "배너를 숨긴다" 와
 *    다른 이야기다: `preventDefault()` 는 브라우저의 네이티브 설치 프롬프트를
 *    억제하는 행위라, 유예 중에 부르면 우리 배너도 네이티브 UI 도 없는 상태가 되어
 *    배너를 한 번 닫은 사용자는 7일간 앱을 설치할 수단 자체를 잃는다.
 *    그래서 유예 분기마다 `preventDefault` 호출 여부를 함께 단언한다.
 */

const toast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0';
/** iPadOS 13+ 의 "데스크톱 모드" — UA 에 iPad 가 없고 Macintosh 로 위장한다. */
const IPADOS_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

const BANNER_TITLE = '앱으로 설치';
const DISMISS_KEY = 'pwa-banner-dismissed-at';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

interface NavigatorStub {
  userAgent?: string;
  vendor?: string;
  platform?: string;
  maxTouchPoints?: number;
  serviceWorker?: { register: (path: string) => Promise<unknown> };
}

/** `navigator` 는 jsdom 이 만든 객체라 필드를 못 바꾼다. 통째로 갈아 끼운다. */
function stubNavigator(nav: NavigatorStub) {
  vi.stubGlobal('navigator', nav);
}

/** 성공하는 SW 등록 대역. 반환된 mock 으로 호출 여부를 단언한다. */
function swRegister(result: Promise<unknown> = Promise.resolve({ scope: 'http://localhost/' })) {
  // 미사용 rejection 경고를 피하기 위해 미리 핸들러를 달아 둔다.
  result.catch(() => undefined);
  return vi.fn(() => result);
}

function setReadyState(value: DocumentReadyState) {
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => value });
}

interface InstallPromptEvent extends Event {
  prompt: ReturnType<typeof vi.fn>;
  userChoice: Promise<{ outcome: string }>;
}

function makeInstallEvent(outcome = 'accepted'): InstallPromptEvent {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent;
  event.prompt = vi.fn();
  event.userChoice = Promise.resolve({ outcome });
  vi.spyOn(event, 'preventDefault');
  return event;
}

async function fireInstallPrompt(outcome = 'accepted') {
  const event = makeInstallEvent(outcome);
  await act(async () => {
    window.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setReadyState('complete');
  stubNavigator({
    userAgent: ANDROID_UA,
    vendor: 'Google Inc.',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    serviceWorker: { register: swRegister() },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (document as unknown as { readyState?: unknown }).readyState;
  delete (window as unknown as { opera?: unknown }).opera;
});

describe('PWARegistration — 기기 판정', () => {
  it.each([
    ['android', 'Mozilla/5.0 (Linux; Android 13; Pixel 7)'],
    ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'],
    ['ipad', 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)'],
    ['ipod', 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)'],
    ['webos', 'Mozilla/5.0 (webOS/1.4.0; U; en-US) Version/1.0 Safari/532.2 Pre/1.0'],
    ['blackberry', 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9900)'],
    ['iemobile', 'Mozilla/5.0 (compatible; MSIE 10.0; Windows Phone 8.0) IEMobile/10.0'],
    ['opera mini', 'Opera/9.80 (J2ME/MIDP; Opera Mini/9.80) Presto/2.5.25'],
  ])('%s UA 는 모바일로 보고 Service Worker 를 등록한다', async (_label, userAgent) => {
    const register = swRegister();
    stubNavigator({ userAgent, platform: 'Linux', maxTouchPoints: 5, serviceWorker: { register } });

    render(<PWARegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js'));
  });

  it('데스크톱 UA 에서는 등록도 배너도 없다', async () => {
    const register = swRegister();
    stubNavigator({
      userAgent: DESKTOP_UA,
      vendor: 'Google Inc.',
      platform: 'Win32',
      maxTouchPoints: 0,
      serviceWorker: { register },
    });

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    expect(register).not.toHaveBeenCalled();
    // 리스너 자체가 달리지 않았어야 한다 — 이벤트가 기본 동작을 그대로 유지한다.
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
  });

  it('iPadOS 13+ 데스크톱 모드(MacIntel + 멀티터치)는 모바일로 본다', async () => {
    const register = swRegister();
    stubNavigator({
      userAgent: IPADOS_DESKTOP_UA,
      platform: 'MacIntel',
      maxTouchPoints: 5,
      serviceWorker: { register },
    });

    render(<PWARegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js'));
  });

  it('터치가 없는 진짜 맥(MacIntel + maxTouchPoints 1)은 데스크톱이다', () => {
    const register = swRegister();
    stubNavigator({
      userAgent: IPADOS_DESKTOP_UA,
      platform: 'MacIntel',
      maxTouchPoints: 1,
      serviceWorker: { register },
    });

    render(<PWARegistration />);

    expect(register).not.toHaveBeenCalled();
  });

  it('멀티터치가 있어도 플랫폼이 MacIntel 이 아니면 데스크톱이다', () => {
    const register = swRegister();
    stubNavigator({
      userAgent: DESKTOP_UA,
      platform: 'Win32',
      maxTouchPoints: 10,
      serviceWorker: { register },
    });

    render(<PWARegistration />);

    expect(register).not.toHaveBeenCalled();
  });

  it('userAgent 가 비어 있으면 vendor 로 판정한다', async () => {
    const register = swRegister();
    stubNavigator({
      userAgent: '',
      vendor: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      platform: 'MacIntel',
      maxTouchPoints: 0,
      serviceWorker: { register },
    });

    render(<PWARegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js'));
  });

  it('userAgent·vendor 가 모두 비어 있으면 window.opera 로 판정한다', async () => {
    const register = swRegister();
    (window as unknown as { opera?: string }).opera = 'Opera/9.80 (Opera Mini/9.80)';
    stubNavigator({
      userAgent: '',
      vendor: '',
      platform: 'Linux',
      maxTouchPoints: 0,
      serviceWorker: { register },
    });

    render(<PWARegistration />);

    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js'));
  });

  it('식별 정보가 하나도 없으면 데스크톱으로 취급한다', () => {
    const register = swRegister();
    stubNavigator({ platform: 'Linux', maxTouchPoints: 0, serviceWorker: { register } });

    render(<PWARegistration />);

    expect(register).not.toHaveBeenCalled();
  });
});

describe('PWARegistration — Service Worker 등록', () => {
  it('등록에 성공하면 scope 를 남긴다', async () => {
    const register = swRegister(Promise.resolve({ scope: 'https://sr.example.com/' }));
    stubNavigator({ userAgent: ANDROID_UA, serviceWorker: { register } });

    render(<PWARegistration />);

    await waitFor(() =>
      expect(logger.info).toHaveBeenCalledWith(
        '[PWA] Service Worker registered with scope: https://sr.example.com/'
      )
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('등록이 Error 로 실패하면 그 Error 를 그대로 넘긴다', async () => {
    const failure = new Error('registration blocked');
    const register = swRegister(Promise.reject(failure));
    stubNavigator({ userAgent: ANDROID_UA, serviceWorker: { register } });

    render(<PWARegistration />);

    await waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('[PWA] Service Worker registration failed', failure)
    );
  });

  it('등록이 Error 가 아닌 값으로 실패하면 Error 로 감싸서 넘긴다', async () => {
    const register = swRegister(Promise.reject('SecurityError'));
    stubNavigator({ userAgent: ANDROID_UA, serviceWorker: { register } });

    render(<PWARegistration />);

    await waitFor(() => expect(logger.error).toHaveBeenCalled());
    const call = vi.mocked(logger.error).mock.calls[0];
    expect(call?.[0]).toBe('[PWA] Service Worker registration failed');
    // 문자열을 그대로 넘기면 로거의 stack 접근이 터진다 — Error 로 감싸야 한다.
    expect(call?.[1]).toBeInstanceOf(Error);
    expect((call?.[1] as Error).message).toBe('SecurityError');
  });

  it('serviceWorker 를 지원하지 않는 브라우저에서도 터지지 않고 설치 배너는 살아 있다', async () => {
    stubNavigator({ userAgent: ANDROID_UA, platform: 'Linux', maxTouchPoints: 5 });

    render(<PWARegistration />);
    await fireInstallPrompt();

    expect(logger.error).not.toHaveBeenCalled();
    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
  });

  it('문서가 아직 로딩 중이면 load 이벤트까지 등록을 미룬다', async () => {
    setReadyState('loading');
    const register = swRegister();
    stubNavigator({ userAgent: ANDROID_UA, serviceWorker: { register } });

    render(<PWARegistration />);
    expect(register).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('load'));
    });

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('언마운트하면 load 리스너를 떼어 등록이 더 이상 일어나지 않는다', async () => {
    setReadyState('loading');
    const register = swRegister();
    stubNavigator({ userAgent: ANDROID_UA, serviceWorker: { register } });

    const { unmount } = render(<PWARegistration />);
    unmount();

    await act(async () => {
      window.dispatchEvent(new Event('load'));
    });

    expect(register).not.toHaveBeenCalled();
  });
});

describe('PWARegistration — 설치 배너 유예', () => {
  it('닫은 적이 없으면 배너를 띄우고 브라우저 기본 프롬프트는 막는다', async () => {
    render(<PWARegistration />);

    const event = await fireInstallPrompt();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
  });

  it('7일 이내에 닫았으면 배너도 띄우지 않고 네이티브 프롬프트도 막지 않는다', async () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - SEVEN_DAYS + 60_000));

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    // 유예 중에 preventDefault() 를 부르면 우리 배너도 네이티브 설치 UI 도 없는
    // 상태가 되어, 배너를 한 번 닫은 사용자는 7일간 앱을 설치할 방법이 없다.
    // 유예 판정을 preventDefault() 보다 먼저 해서 브라우저에 길을 내줘야 한다.
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
  });

  it('유예가 끝나는 순간(경계값)에도 네이티브 프롬프트를 막지 않는다', async () => {
    // 정확히 7일 = 아직 유예 중(`<=` 비교). 경계에서 억제가 되살아나면 안 된다.
    // 핸들러가 부르는 Date.now() 가 몇 ms 뒤라 경계를 넘어가므로 시각을 고정한다.
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    localStorage.setItem(DISMISS_KEY, String(now - SEVEN_DAYS));

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
  });

  it('7일이 지났으면 배너를 다시 띄우고 그때는 기본 프롬프트를 막는다', async () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() - SEVEN_DAYS - 60_000));

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('저장된 값이 숫자가 아니면 유예를 무시하고 배너를 띄운다', async () => {
    localStorage.setItem(DISMISS_KEY, 'not-a-number');

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('localStorage 접근이 막혀 있어도(사파리 프라이빗 등) 배너를 띄우고 로그만 남긴다', async () => {
    const boom = new Error('SecurityError: localStorage is disabled');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw boom;
    });

    render(<PWARegistration />);
    const event = await fireInstallPrompt();

    expect(logger.error).toHaveBeenCalledWith('[PWA] Error checking dismissed status', boom);
    expect(screen.getByText(BANNER_TITLE)).toBeInTheDocument();
    // 배너를 띄우기로 했으니 이 경로에서는 억제가 맞다.
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('언마운트 후에는 beforeinstallprompt 를 더 이상 가로채지 않는다', async () => {
    const { unmount } = render(<PWARegistration />);
    unmount();

    const event = await fireInstallPrompt();

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('PWARegistration — 배너 조작', () => {
  it('설치를 수락하면 프롬프트를 띄우고 안내 토스트를 남긴 뒤 배너를 닫는다', async () => {
    render(<PWARegistration />);
    const event = await fireInstallPrompt('accepted');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '설치' }));
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      title: '설치가 시작되었습니다',
      description: '잠시 후 앱 목록에서 확인하실 수 있습니다.',
    });
    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
  });

  it('설치 프롬프트를 사용자가 거절하면 토스트 없이 배너만 닫는다', async () => {
    render(<PWARegistration />);
    const event = await fireInstallPrompt('dismissed');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '설치' }));
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
  });

  it('X 로 닫으면 배너가 사라지고 유예 시각이 저장된다', async () => {
    const before = Date.now();
    render(<PWARegistration />);
    await fireInstallPrompt();

    const [, dismissButton] = screen.getAllByRole('button');
    await act(async () => {
      fireEvent.click(dismissButton!);
    });

    expect(screen.queryByText(BANNER_TITLE)).not.toBeInTheDocument();
    const saved = Number(localStorage.getItem(DISMISS_KEY));
    expect(Number.isNaN(saved)).toBe(false);
    expect(saved).toBeGreaterThanOrEqual(before);
  });

  it('배너가 뜨기 전에는 아무것도 렌더하지 않는다', () => {
    const { container } = render(<PWARegistration />);

    expect(container).toBeEmptyDOMElement();
  });
});
