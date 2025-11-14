import { SRService } from "@/services/sr.service";
import { ClientService } from "@/services/client.service";
import { UserService } from "@/services/user.service";
import { SRsDataTable } from "@/components/srs/SRsDataTable";
import { Prisma } from "@prisma/client";

type Props = {
  params: Promise<{}>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Helper to parse search params
const getSearchParam = (param: string | string[] | undefined): string | undefined => {
  return Array.isArray(param) ? param[0] : param;
};

export default async function SRsPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const page = parseInt(getSearchParam(resolvedSearchParams.page) ?? "1", 10);
  const itemsPerPage = parseInt(getSearchParam(resolvedSearchParams.itemsPerPage) ?? "20", 10);
  const sort = getSearchParam(resolvedSearchParams.sort) ?? "createdAt.desc";
  const [sortField, sortOrder] = sort.split(".");

  const status = getSearchParam(resolvedSearchParams.status);
  const priority = getSearchParam(resolvedSearchParams.priority);
  const clientId = getSearchParam(resolvedSearchParams.clientId);
  const assigneeId = getSearchParam(resolvedSearchParams.assigneeId);
  const search = getSearchParam(resolvedSearchParams.search);
  const dateFrom = getSearchParam(resolvedSearchParams.dateFrom);
  const dateTo = getSearchParam(resolvedSearchParams.dateTo);

  const srService = new SRService();
  const clientService = new ClientService();
  const userService = new UserService();

  const where: Prisma.SRWhereInput = {};
  if (status && status !== "all") where.status = status as any;
  if (priority && priority !== "all") where.priority = priority as any;
  if (clientId && clientId !== "all") where.clientId = clientId;
  if (assigneeId && assigneeId !== "all") {
    where.assigneeId = assigneeId === "unassigned" ? null : assigneeId;
  }
  // Handle date filtering
  if (dateFrom || dateTo) {
    if (!where.createdAt) {
      where.createdAt = {};
    }
    if (dateFrom) {
      (where.createdAt as Prisma.DateTimeFilter<'SR'>).gte = new Date(dateFrom);
    }
    if (dateTo) {
      (where.createdAt as Prisma.DateTimeFilter<'SR'>).lte = new Date(dateTo);
    }
  }
  if (search) {
    where.OR = [
      { srNumber: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { client: { name: { contains: search, mode: 'insensitive' } } },
      { requester: { name: { contains: search, mode: 'insensitive' } } },
      { assignee: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const orderBy: Prisma.SROrderByWithRelationInput = {
    [sortField]: sortOrder,
  };

  // Fetch data in parallel
  const [srData, clients, users] = await Promise.all([
    srService.getAllSRs({
      where,
      orderBy,
      skip: (page - 1) * itemsPerPage,
      take: itemsPerPage,
    }),
    clientService.getAllClients(),
    userService.getAllUsers() // Assuming a method to get all users exists
  ]);

  const totalCount = await srService.countSRs({ where });

  const paginationInfo = {
    currentPage: page,
    itemsPerPage,
    totalCount,
    totalPages: Math.ceil(totalCount / itemsPerPage),
    hasPrevPage: page > 1,
    hasNextPage: page < Math.ceil(totalCount / itemsPerPage),
  };

  return (
    <SRsDataTable 
      srs={srData} 
      paginationInfo={paginationInfo}
      clients={clients}
      users={users}
    />
  );
}
