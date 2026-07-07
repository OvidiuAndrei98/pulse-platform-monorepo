import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3"; // Modificat aici

using TypeSpec.Http;
using TypeSpec.Rest;

@service
namespace Pulse;

model Event {
  id: string;
  title: string;
  clubName: string;
  date: utcDateTime;
  ticketPrice: float64;
  latitude: float64;
  longitude: float64;
}

model MapEventPin {
  id: string;
  title: string;
  clubName: string;
  date: utcDateTime;
  latitude: float64;
  longitude: float64;
  remainingEventsCount: int32;
}

@route("/public")
namespace PublicAPI {
  @route("/events/map")
  @get op getMapPins(
    @query lat: float64,
    @query lng: float64,
    @query radiusInKm?: int32 = 10
  ): MapEventPin[];
}