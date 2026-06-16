import { registerSRNotificationListeners } from './listeners/sr-notification.listener';
import { ClientService } from './client.service';
import { PermissionService } from './permission.service';
import { RoleService } from './role.service';
import { SRService } from './sr.service';
import { UserService } from './user.service';

let listenersRegistered = false;

/**
 * Service Registry
 *
 * 서비스 인스턴스를 중앙에서 싱글톤으로 관리하여
 * 중복 생성 비용을 방지하고 의존성 주입 및 모킹(Mocking)을 용이하게 합니다.
 */
class ServiceRegistry {
  private instances: Map<string, any> = new Map();

  constructor() {
    if (!listenersRegistered) {
      registerSRNotificationListeners();
      listenersRegistered = true;
    }
  }

  get userService(): UserService {
    return this.getOrCreate('userService', () => new UserService());
  }

  get clientService(): ClientService {
    return this.getOrCreate('clientService', () => new ClientService());
  }

  get srService(): SRService {
    return this.getOrCreate('srService', () => new SRService());
  }

  get roleService(): RoleService {
    return this.getOrCreate('roleService', () => new RoleService());
  }

  get permissionService(): PermissionService {
    return this.getOrCreate('permissionService', () => new PermissionService());
  }

  /**
   * 테스트 환경에서 서비스 인스턴스를 동적으로 Mock으로 교체할 수 있도록 제공합니다.
   */
  setMockInstance(name: string, mock: any) {
    this.instances.set(name, mock);
  }

  /**
   * 레지스트리를 초기화합니다. (주로 테스트 beforeEach에서 사용)
   */
  clear() {
    this.instances.clear();
  }

  private getOrCreate<T>(key: string, factory: () => T): T {
    if (!this.instances.has(key)) {
      this.instances.set(key, factory());
    }
    return this.instances.get(key);
  }
}

export const services = new ServiceRegistry();
