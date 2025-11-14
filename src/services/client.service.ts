import { z } from "zod";
import { ClientRepository } from "@/repositories/client.repository";
import { UserRepository } from "@/repositories/user.repository";
import { UserService } from "./user.service";

const clientCreateSchema = z.object({
  code: z.string().min(2, "고객사 코드는 최소 2자 이상이어야 합니다."),
  name: z.string().min(1, "고객사 이름을 입력해주세요."),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("유효한 이메일 주소를 입력해주세요.").optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
});

const clientUpdateSchema = z.object({
  name: z.string().min(1, "고객사 이름을 입력해주세요.").optional(),
  industry: z.string().optional(),
  contactPerson: z.string().optional(),
  contactEmail: z.string().email("유효한 이메일 주소를 입력해주세요.").optional(),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  contractStartDate: z.string().optional(),
  contractEndDate: z.string().optional(),
});

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
      throw new Error("이미 존재하는 고객사 코드입니다.");
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
      throw new Error("고객사를 찾을 수 없습니다.");
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
      throw new Error("고객사를 찾을 수 없습니다.");
    }

    // TODO: 관련된 SR, 사용자 등이 있는지 확인하고 처리
    // 현재 단계에서는 단순 삭제
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