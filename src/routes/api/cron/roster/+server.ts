import { VATSIM_CORE_API_TOKEN } from "$env/static/private";
import type { RequestHandler } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { ulid } from "ulid";
import type { UserFacilityAssignment } from "@prisma/client";

interface UserRecord {
  primary: UserFacilityAssignment | null;
  other: UserFacilityAssignment[];
}

export const GET: RequestHandler = async () => {
  console.log("[RosterUpdate] Roster update task started");

  console.log("[RosterUpdate] Pulling member count from VATSIM");

  let initial_vatsim_resp = await fetch(
    "https://api.vatsim.net/v2/orgs/division/MENA?limit=1",
    {
      headers: {
        "X-API-Key": VATSIM_CORE_API_TOKEN,
      },
    },
  );

  let initial_json = await initial_vatsim_resp.json();

  if (!initial_vatsim_resp.ok) {
    throw new Error(JSON.stringify(initial_json));
  }

  let need_to_pull = initial_json.count;

  console.log(
    `[RosterUpdate] Loading information about ${need_to_pull} members`,
  );

  let real_roster_resp = await fetch(
    `https://api.vatsim.net/v2/orgs/division/MENA?limit=${need_to_pull}`,
    {
      headers: {
        "X-API-Key": VATSIM_CORE_API_TOKEN,
      },
    },
  );

  console.log("[RosterUpdate] Planning");

  let roster_json = await real_roster_resp.json();

  if (!real_roster_resp.ok) {
    throw new Error(JSON.stringify(roster_json));
  }

  let roster = roster_json.items;

  let existing_roster = {};
  let existing_roster_arr = await prisma.user.findMany();
  for (let existing_user of existing_roster_arr) {
    existing_roster[existing_user.id.toString()] = existing_user;
  }

  let vaccs = {};
  let vaccs_arr = await prisma.facility.findMany();
  for (let vacc of vaccs_arr) {
    vaccs[vacc.id] = vacc;
  }

  let ratings = [
    ["SUS", "Suspended"],
    ["OBS", "Observer"],
    ["S1", "Tower Trainee"],
    ["S2", "Tower Controller"],
    ["S3", "Senior Student"],
    ["C1", "Enroute Controller"],
    ["C2", "Controller 2 (not in use)"],
    ["C3", "Senior Controller"],
    ["I1", "Instructor"],
    ["I2", "Instructor 2 (not in use)"],
    ["I3", "Senior Instructor"],
    ["SUP", "Supervisor"],
    ["ADM", "Administrator"],
  ];

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let total = 0;
  let assigned = 0;
  let reassigned = 0;
  let askipped = 0;
  let atotal = 0;

  let userAssignments: string[UserFacilityAssignment] = {};

  let all_assignments: UserFacilityAssignment[] =
    await prisma.userFacilityAssignment.findMany();
  for (let assignment of all_assignments) {
    if (!userAssignments[assignment.userId]) {
      userAssignments[assignment.userId] = {
        primary: null,
        other: [],
      };
    }

    if (assignment.assignmentType === "Primary") {
      userAssignments[assignment.userId].primary = assignment;
    } else {
      userAssignments[assignment.userId].other.push(assignment);
    }
  }

  console.log("[RosterUpdate] Start updating users");

  for (let roster_user of roster) {
    total += 1;

    let vacc: string | null = null;

    if (
      roster_user.subdivision_id &&
      Object.keys(vaccs).includes(roster_user.subdivision_id)
    ) {
      vacc = roster_user.subdivision_id;
    }

    if (Object.keys(existing_roster).includes(roster_user.id.toString())) {
      let existing = existing_roster[roster_user.id.toString()];

      // Janky bizzaro way of not updating unchanged users

      let new_data = {
        name: `${roster_user.name_first} ${roster_user.name_last}`,
        ratingId: roster_user.rating,
        ratingShort: ratings[roster_user.rating][0],
        ratingLong: ratings[roster_user.rating][1],
        region: roster_user.region_id,
        division: roster_user.division_id,
      };

      let compare_array = [
        [existing.name, new_data.name],
        [existing.ratingId, new_data.ratingId],
        [existing.ratingShort, new_data.ratingShort],
        [existing.ratingLong, new_data.ratingLong],
        [existing.region, new_data.region],
        [existing.division, new_data.division],
      ];
      for (let [before, after] of compare_array) {
        if (before !== after) {
          await prisma.user.update({
            where: { id: roster_user.id.toString() },
            data: new_data,
          });

          console.log(
            `[RosterUpdate ${total}/${roster.length}] Updated existing user ${roster_user.id}`,
          );
          updated += 1;
          break;
        }
      }

      skipped += 1;
    } else {
      await prisma.user.create({
        data: {
          id: roster_user.id.toString(),
          name: `${roster_user.name_first} ${roster_user.name_last}`,
          ratingId: roster_user.rating,
          ratingShort: ratings[roster_user.rating][0],
          ratingLong: ratings[roster_user.rating][1],
          region: roster_user.region_id,
          division: roster_user.division_id,
          recommendedTrainingQueues: [],
          completedTrainingQueues: [],
        },
      });

      console.log(
        `[RosterUpdate ${total}/${roster.length}] Created new user ${roster_user.id}`,
      );
      created += 1;
    }

    // get the user's primary assignment
    let userRecord = userAssignments[roster_user.id.toString()];

    let needsCreateDivisional = true;
    let needsVacc: "create" | "update" | "leavealone" = "leavealone";

    if (!userRecord) {
      needsCreateDivisional = true;
      if (vacc) {
        needsVacc = "create";
      }
    } else {
      if (vacc && !userRecord.primary) {
        needsVacc = "create";
      } else if (vacc && userRecord.primary.facilityId !== vacc) {
        needsVacc = "update";
      } else {
        needsVacc = "leavealone";
      }

      for (let otherA of userRecord.other) {
        if (otherA.facilityId === "MENA") {
          needsCreateDivisional = false;
        }
      }
    }

    atotal += 1;
    if (needsCreateDivisional) {
      assigned += 1;
      console.log(
        `[RosterUpdate ${total}/${roster.length}] Assigned ${roster_user.id} to MENA as a secondary divisional assignment`,
      );
      await prisma.userFacilityAssignment.create({
        data: {
          id: ulid(),
          userId: roster_user.id.toString(),
          assignmentType: "Secondary",
          facilityId: "MENA",
        },
      });
    } else {
      console.log(
        `[RosterUpdate ${total}/${roster.length}] Skipped assignment of ${roster_user.id} as they already have division assignment`,
      );
      askipped += 1;
    }

    atotal += 1;
    if (needsVacc === "create") {
      assigned += 1;
      console.log(
        `[RosterUpdate ${total}/${roster.length}] Assigned ${roster_user.id} to ${vacc} as their primary facility`,
      );
      await prisma.userFacilityAssignment.create({
        data: {
          id: ulid(),
          userId: roster_user.id.toString(),
          facilityId: vacc,
          assignmentType: "Primary",
        },
      });
    } else if (needsVacc === "update") {
      reassigned += 1;
      console.log(
        `[RosterUpdate ${total}/${roster.length}] Reassigned ${roster_user.id} to ${vacc} as their new primary facility from ${userRecord.primary.id}`,
      );
      await prisma.userFacilityAssignment.update({
        where: {
          id: userRecord.primary.id,
        },
        data: {
          facilityId: vacc,
        },
      });
    } else {
      askipped += 1;
      console.log(
        `[RosterUpdate ${total}/${roster.length}] Skipped assignment of ${roster_user.id} to a vACC`,
      );
    }
  }

  console.log(
    `[RosterUpdate] Roster update task finished\tcreated=${created} updated=${updated} skipped=${skipped} total=${total}/${
      created + updated + skipped
    }`,
  );

  console.log(
    `[RosterUpdate] User assignments updated\tassigned=${assigned} reassigned=${reassigned} skipped=${askipped} total=${atotal}/${assigned + reassigned + askipped}`,
  );

  return new Response("");
};
