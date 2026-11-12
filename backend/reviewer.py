from models import AdaptationList


def check_time_constraints(adaptations: AdaptationList, constraints: dict) -> tuple[bool, str]:
    """
    Pure code check. Returns (passed, feedback).
    This is the reliable gate that makes the self-correction demo work.
    """
    max_individual = constraints.get("individual_time_minutes", 5)
    rejected = []

    for i, ad in enumerate(adaptations.adaptations):
        if ad.time_required_minutes > max_individual:
            rejected.append(
                f"Adaptation {i+1} for {ad.learner} requires {ad.time_required_minutes} minutes, "
                f"but the teacher only has {max_individual} minutes for individual support."
            )

    if rejected:
        return False, " | ".join(rejected)
    return True, "All adaptations respect the time constraint."