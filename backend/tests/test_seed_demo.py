from datetime import datetime, time

from app.timeutil import TZ, is_late
from seed_demo import CHECKINS, LATE_INDEX, DemoClock


def _clock(hh: int, mm: int = 0) -> DemoClock:
    return DemoClock(datetime(2026, 11, 4, hh, mm, tzinfo=TZ))


def _arrivals(clock: DemoClock) -> dict[int, datetime]:
    out = {}
    for i, c in enumerate(CHECKINS):
        if c and (at := clock.checkin(c[0], arrives_late=(i == LATE_INDEX))):
            out[i] = at
    return out


def test_a_las_9_el_tardio_ya_llego_tarde_y_los_demas_a_su_hora() -> None:
    arr = _arrivals(_clock(9, 0))
    assert is_late(arr[LATE_INDEX])
    assert arr[0].time() == time(7, 2)  # las llegadas no se recorren
    assert all(not is_late(at) for i, at in arr.items() if i != LATE_INDEX)


def test_a_las_7_30_solo_llegaron_los_tempraneros_y_nadie_tarde() -> None:
    arr = _arrivals(_clock(7, 30))
    assert LATE_INDEX not in arr
    assert all(at.time() <= time(7, 25) for at in arr.values())


def test_actividad_nunca_queda_en_el_futuro_y_conserva_el_orden() -> None:
    clock = _clock(9, 40)
    times = [clock.activity(t) for t in (time(9, 20), time(10, 5), time(10, 15), time(10, 20), time(11, 30))]
    assert times == sorted(times)
    assert times[-1] <= clock.cutoff


def test_en_la_tarde_todo_queda_a_su_hora() -> None:
    clock = _clock(13, 0)
    assert clock.activity(time(10, 20)).time() == time(10, 20)
    assert _arrivals(clock)[LATE_INDEX].time() == time(9, 12)
