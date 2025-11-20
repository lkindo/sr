import { z } from "zod"
import { srCreateSchema, srUpdateSchema } from "@/lib/schemas"
import { getFormDataValue } from "@/lib/form-data-parser"

export type SRCreateInput = z.infer<typeof srCreateSchema>
export type SRUpdateInput = z.infer<typeof srUpdateSchema>

export function buildSRCreateInput(formData: FormData): SRCreateInput {
  return {
    title: getFormDataValue(formData, "title") || "",
    description: getFormDataValue(formData, "description") || "",
    clientId: getFormDataValue(formData, "clientId") || "",
    serviceCategoryId: getFormDataValue(formData, "serviceCategoryId") || "",
    requestedPriority: (getFormDataValue(formData, "requestedPriority") || "MEDIUM") as SRCreateInput["requestedPriority"],
    requestedCompletionDate: getFormDataValue(formData, "requestedCompletionDate") || undefined,
  }
}

export function buildSRUpdateInput(formData: FormData): Record<string, any> {
  const rawData = {
    title: getFormDataValue(formData, "title") || undefined,
    description: getFormDataValue(formData, "description") || undefined,
    serviceCategoryId: getFormDataValue(formData, "serviceCategoryId") || undefined,
    priority: (getFormDataValue(formData, "priority") || undefined) as SRUpdateInput["priority"],
    status: (getFormDataValue(formData, "status") || undefined) as SRUpdateInput["status"],
    assignedToId: getFormDataValue(formData, "assignedToId"),
    expectedCompletionDate: getFormDataValue(formData, "expectedCompletionDate"),
    dueDate: getFormDataValue(formData, "dueDate"),
    actualCompletionDate: getFormDataValue(formData, "actualCompletionDate"),
    resolutionDescription: getFormDataValue(formData, "resolutionDescription"),
    rejectionReason: getFormDataValue(formData, "rejectionReason"),
    satisfactionRating: getFormDataValue(formData, "satisfactionRating") || undefined,
    additionalFeedback: getFormDataValue(formData, "additionalFeedback") || undefined,
    actualPriority: (getFormDataValue(formData, "actualPriority") || undefined) as SRUpdateInput["actualPriority"],
    estimatedHours: getFormDataValue(formData, "estimatedHours") || undefined,
    estimatedCompletionDate: getFormDataValue(formData, "estimatedCompletionDate") || undefined,
    intakeNotes: getFormDataValue(formData, "intakeNotes") || undefined,
    assigneeId: getFormDataValue(formData, "assigneeId") || undefined,
    changeReason: getFormDataValue(formData, "changeReason") || undefined,
  }

  const processed: Record<string, any> = {}
  for (const [key, value] of Object.entries(rawData)) {
    if (value === "" || value === undefined || value === null) {
      if (key === "priority" || key === "status" || key === "actualPriority") {
        processed[key] = undefined
      } else {
        processed[key] = null
      }
    } else if (key === "satisfactionRating" && value !== undefined) {
      const rating = parseInt(value as string, 10)
      processed[key] = isNaN(rating) ? null : rating
    } else if (key === "estimatedHours" && value !== undefined && value !== "") {
      const hours = parseFloat(value as string)
      processed[key] = isNaN(hours) ? undefined : hours
    } else {
      processed[key] = value
    }
  }

  return processed
}

