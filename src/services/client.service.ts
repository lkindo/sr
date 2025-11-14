import { z } from "zod";
import { ClientRepository } from "@/repositories/client.repository";
import { UserRepository } from "@/repositories/user.repository";
import { UserService } from "./user.service";
import { clientCreateSchema, clientUpdateSchema } from "@/lib/schemas";
import { NotFoundError, DuplicateError, ReferentialIntegrityError } from "@/lib/errors";

type ClientCreateData = z.infer<typeof clientCreateSchema>;
type ClientUpdateData = z.infer<typeof clientUpdateSchema>;

export class ClientService {
  private clientRepository: ClientRepository;
  private userRepository: UserRepository;
  private userService: UserService;

  constructor() {
    this.clientRepository = new ClientRepository();
    this.userRepository = new UserRepository();
    this.userService = new UserService();
  }

  async getClientById(id: string) {
    return this.clientRepository.findById(id);
  }

  async getClientByCode(code: string) {
    return this.clientRepository.findByCode(code);
  }

  async getClientByName(name: string) {
    return this.clientRepository.findByName(name);
  }

  async getAllClients() {
    return this.clientRepository.findAll();
  }

  async createClient(data: ClientCreateData) {
    const validated = clientCreateSchema.parse(data);

    // 코드 중복 확인
    const existingClient = await this.clientRepository.findByCode(validated.code);
    if (existingClient) {
      throw new DuplicateError("고객사 코드", "code", validated.code);
    }

    return this.clientRepository.create({
      code: validated.code,
      name: validated.name,
      industry: validated.industry,
      contactPerson: validated.contactPerson,
      contactEmail: validated.contactEmail,
      contactPhone: validated.contactPhone,
      address: validated.address,
      contractStartDate: validated.contractStartDate ? new Date(validated.contractStartDate) : null,
      contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
      isActive: true,
    });
  }

  async updateClient(id: string, data: ClientUpdateData) {
    const validated = clientUpdateSchema.parse(data);

    // 기존 고객사 정보 확인
    const existingClient = await this.clientRepository.findById(id);
    if (!existingClient) {
      throw new NotFoundError("고객사", id);
    }

    return this.clientRepository.update(id, {
      name: validated.name,
      industry: validated.industry,
      contactPerson: validated.contactPerson,
      contactEmail: validated.contactEmail,
      contactPhone: validated.contactPhone,
      address: validated.address,
      contractStartDate: validated.contractStartDate ? new Date(validated.contractStartDate) : null,
      contractEndDate: validated.contractEndDate ? new Date(validated.contractEndDate) : null,
    });
  }

  async deleteClient(id: string) {
    // 고객사 삭제 전 관련 데이터 확인
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundError("고객사", id);
    }

    // 참조 무결성 확인: 관련된 데이터가 있는지 체크
    const relatedCounts = await this.clientRepository.getRelatedDataCounts(id);

    const hasRelatedData =
      relatedCounts.srsCount > 0 ||
      relatedCounts.usersCount > 0 ||
      relatedCounts.serviceCategoriesCount > 0 ||
      relatedCounts.clientHandlersCount > 0;

    if (hasRelatedData) {
      const errorMessages: string[] = [];
      if (relatedCounts.srsCount > 0) {
        errorMessages.push(`${relatedCounts.srsCount}개의 SR`);
      }
      if (relatedCounts.usersCount > 0) {
        errorMessages.push(`${relatedCounts.usersCount}개의 사용자 연결`);
      }
      if (relatedCounts.serviceCategoriesCount > 0) {
        errorMessages.push(`${relatedCounts.serviceCategoriesCount}개의 서비스 카테고리`);
      }
      if (relatedCounts.clientHandlersCount > 0) {
        errorMessages.push(`${relatedCounts.clientHandlersCount}개의 담당자 연결`);
      }

      throw new ReferentialIntegrityError(
        `고객사를 삭제할 수 없습니다. 다음 관련 데이터가 존재합니다: ${errorMessages.join(', ')}. ` +
        `먼저 관련 데이터를 삭제하거나 고객사를 비활성화하세요.`
      );
    }

    // 관련 데이터가 없으면 삭제 진행
    return this.clientRepository.delete(id);
  }

  async activateClient(clientId: string) {
    return this.clientRepository.activateClient(clientId);
  }

  async deactivateClient(clientId: string) {
    return this.clientRepository.deactivateClient(clientId);
  }

  async getClientsByUserId(userId: string) {
    return this.clientRepository.findByUserId(userId);
  }
}