import prisma from "$lib/prisma";
import type { PageServerLoad } from "./$types";
import { getUserRoles } from "$lib/perms/getUserRoles";
import { can } from "$lib/perms/can";
import { superValidate } from "sveltekit-superforms/server";
import { formSchema } from "$lib/components/resources_page/schema";
import { handleResourceSubmit } from "$lib/components/resources_page/action";
import type { Actions } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, parent }) => {
  let { user } = await parent();
  let user_roles = await getUserRoles(user.id);

  if (
    can(
      user_roles!,
      params.id,
      user.vaccId,
      `vacc.${params.id}.resource.viewPrivate`,
    )
  ) {
    return {
      resources: await prisma.resource.findMany({
        where: {
          vaccId: params.id,
        },
      }),
      form: await superValidate(formSchema),
    };
  } else {
    return {
      resources: await prisma.resource.findMany({
        where: {
          vaccId: params.id,
          isStaffOnly: false,
        },
      }),
      form: await superValidate(formSchema),
    };
  }
};

export const actions: Actions = {
  create: (e) => handleResourceSubmit(e, e.params.id!),
};
