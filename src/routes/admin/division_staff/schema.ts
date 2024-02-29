import { z } from "zod";

export const formSchema = z.object({
    cid: z.string(),
    facilityId: z.string()
});

export type FormSchema = typeof formSchema;
