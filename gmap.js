var map = null;
var map_init_params = new Object();
var ajax_query = null;
var street_address_timer = null;
var cities = new Array();
var map_city,map_city_ukr;
var map_editor;
var map_tarifs = new Array();
var parkings = new Array();
var areas = new Array();
var points = new Array();
var transit_points = new Array();
var deleteMenu;
DeleteMenu.prototype = new google.maps.OverlayView();

function getParkingById(id){
	if (parkings.length > 0) {
		for (var i=0;i<parkings.length;i++) 
			if (parkings[i].id == id) return parkings[i];
	}
	else return false;
}

function getParkingIdxById(id){
	if (parkings.length > 0) {
		for (var i=0;i<parkings.length;i++) 
			if (parkings[i].id == id) return i;
	}
	else return null;
}

function getAreaById(id){
	if (areas.length > 0) {
		for (var i=0;i<areas.length;i++) 
			if (areas[i].id == id) return areas[i];
	}
	else return false;
}

function getAreaIdxById(id){
	if (areas.length > 0) {
		for (var i=0;i<areas.length;i++) 
			if (areas[i].id == id) return i;
	}
	else return null;
}

function initMap(){
	ajax_query = new AjaxQuery();//создаем объект для связи с сервером
	ajax_query.init();
	map = new GMap();
	map.init();	
	if (typeof actions !== "undefined") actions.init();
	else arm.init();
}

//объект управления картой
function GMap(){
	self = this;
	this.geocoder = null;
	this.current_georesults = new Object();
	this.hand_made_street = false;
	this.hand_made_number = false;
	this.hand_edit_street = false;
	this.show_address = false;
	this.current_address_info = null;
	this.draw_parkings = false;
	this.edit_parkings = false;
	this.draw_transit = false;
	this.edit_transit = false;
	this.draw_areas = false;
	this.edit_areas = false;
	this.prepared_polygon = new Array();
	this.completed_polygon = null;
	this.router = null;
	this.router_display = null;
	this.router_draggable = false;
	this.measurer = null;
	this.current_bounds = null;
	this.tmp_latlng = null;
	this.current_transit = null;
	
	this.cursor;
	var w, m, h;
	
	this.init = function(lat,lng,zoom) {
		lat = lat || 46.458;
		lng = lng || 30.701;
		zoom = zoom || 11;
//создание карты и настройка ее отображения	
    	$("#GMapsID").removeClass("hidden");
		this.map = new google.maps.Map(document.getElementById("GMapsID"),{
          center: new google.maps.LatLng(lat, lng),
          zoom: zoom,
          mapTypeId: google.maps.MapTypeId.ROADMAP
        });
		
		this.current_bounds = map.map.getBounds();
		this.geocoder = new google.maps.Geocoder();
		google.maps.event.addListener(this.map,"click",this.clickMap);
		this.router = new google.maps.DirectionsService();
		this.router_display = new google.maps.DirectionsRenderer({draggable: this.router_draggable, suppressMarkers: true}); 
		this.measurer = new google.maps.DistanceMatrixService();
	}
	
	this.setCenter = function(latlng) {
		this.map.setCenter(latlng);
	}
	
	this.setZoom = function(zoom) {
		this.map.setZoom(zoom);
	}
	
	this.clickMap = function(ev) {
		//console.dir(ev);
		if (map.hand_made_street == true) {
			map.map.setCenter(ev.latLng);
			map.getAddressByLatLng(ev.latLng,0);
			ev.stop();
		}
		
		if (map.hand_made_number == true) {
			map.map.setCenter(ev.latLng);
			map.map.setZoom(18);
			map.current_georesults = new Object();	
			map.current_georesults.address = new Array();
			map.current_georesults.markers = new Object();
			var street = selectStreet.getStreetById(selectStreet.selectedId);
			map.current_georesults.address.push({
				address_components: [
					{long_name: $.trim($("#adrNumber").val()),types:["street_number"]},
					{long_name: street.name,types:["route"]},
					{long_name: street.region,types:["sublocality"]},
					{long_name: street.city,types:["locality"]},
					{long_name: street.country,types:["country"]}
				],
				geometry: [],
				types: ["street_address"]
			});
			map.current_georesults.address[0].geometry.location = ev.latLng;
			map.current_georesults.address[0].geometry.viewport = map.map.getBounds();
			actions.showAddressSearchingResults(true);
			ev.stop();
		}
		
		if (map.show_address == true) {
			map.clearAddressInfo();
			map.current_address_info = new google.maps.InfoWindow({
      			content: "<div id='infoAddress'></div>"
  			});
			map.current_address_info.setPosition(ev.latLng);
			google.maps.event.addListener(map.current_address_info, 'closeclick', function() { map.clearAddressInfo(); });
			map.showAddressByLatLng(ev.latLng);
			/*if (map.tmp_latlng !== null) {
				console.log(google.maps.geometry.spherical.computeDistanceBetween(map.tmp_latlng,ev.latLng));
				console.log(map.latlng2distance(map.tmp_latlng.lat(),map.tmp_latlng.lng(),ev.latLng.lat(),ev.latLng.lng()));
			}
			map.tmp_latlng = ev.latLng;*/
			ev.stop();
		}
		
		if ((map.draw_parkings == true) || (map.draw_areas == true)) {//новые стоянки и районы
			var marker = map.createCustomMarker(ev.latLng,"MARKER_BORDER",true);
			map.prepared_polygon.push(marker);
			ev.stop();
		}
		
		if (map.draw_transit == true) {//новые транзитные точки
			actions.pushTransitPoint(ev.latLng.lat(),ev.latLng.lng());
			ev.stop();
		}
		
		/*if (parkings.length > 0) {
			var parking = map.getParkingByLatLng(ev.latLng);
			if (parking !== null) alert("Стоянка "+parking.name); 
			ev.stop();	
		}*/
	}
	
	this.isPointInPoly = function(poly,latlng,lng){
		if (typeof lng =="undefined") var pt = {"lat":latlng.lat(),"lng":latlng.lng()}; 
		else var pt = {"lat":latlng,"lng":lng};			
	    for(var c = false, i = -1, k = poly.length, j = k - 1; ++i < k; j = i)
    	    if (((poly[i].lat <= pt.lat && pt.lat < poly[j].lat) || (poly[j].lat <= pt.lat && pt.lat < poly[i].lat))
        	&& (pt.lng < (poly[j].lng - poly[i].lng) * (pt.lat - poly[i].lat) / (poly[j].lat - poly[i].lat) + poly[i].lng)) c = !c;
    	return c;
	}
	
	this.latlng2distance = function(lat1,lng1,lat2,lng2)  {
    	//радиус Земли
	    var R = 6378137;
     
	    //перевод коордитат в радианы
    	lat1 *= Math.PI / 180;
	    lat2 *= Math.PI / 180;
    	lng1 *= Math.PI / 180;
	    lng2 *= Math.PI / 180;
     
    	//вычисление косинусов и синусов широт и разницы долгот
	    var cl1 = Math.cos(lat1);
    	var cl2 = Math.cos(lat2);
	    var sl1 = Math.sin(lat1);
    	var sl2 = Math.sin(lat2);
	    var delta = lng2 - lng1;
    	var cdelta = Math.cos(delta);
	    var sdelta = Math.sin(delta);
     
	    //вычисления длины большого круга
    	var y = Math.sqrt(Math.pow(cl2 * sdelta, 2) + Math.pow(cl1 * sl2 - sl1 * cl2 * cdelta, 2));
	    var x = sl1 * sl2 + cl1 * cl2 * cdelta;
    	var ad = Math.atan2(y, x);
	    var dist = ad * R; //расстояние между двумя координатами в метрах
 
    	return dist;
	}
	
	this.clearRoute = function(){
		if (this.router_display.start) this.router_display.start.setMap(null);
		if (this.router_display.end) this.router_display.end.setMap(null);
		if (this.current_georesults.markers && this.current_georesults.markers.street) this.current_georesults.markers.street.setMap(null);
		if (this.router_display.way) 
			for (var i=0;i<this.router_display.way.length;i++) this.router_display.way[i].setMap(null);
		delete this.router_display.points;
		this.router_display.setMap(null);	
	}
	
	this.clearPreparedPolygon = function(){
		if (map.prepared_polygon.length > 0) 
			for(var i=0;i<map.prepared_polygon.length;i++) map.prepared_polygon[i].setMap(null);	
	}
	
	this.showAddressByLatLng = function(latlng) {
		this.geocoder.geocode( { 'latLng': latlng }, function(results, status) {
			/*if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.street)) map.current_georesults.markers.street.setMap(null);
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.number)) map.current_georesults.markers.number.setMap(null);
			map.current_georesults = new Object();	
			map.current_georesults.streets = new Array();
			map.current_georesults.markers = new Object();*/
	    	if (status == google.maps.GeocoderStatus.OK) {
				//console.dir(results);
				var str = "<div id='infoAddress'>В этом месте адрес не найден</div>";
				var result_idx = -1;
				var distance = 50;
				var tmp = 0;
				$(results).each(function(idx){
					//console.dir(results[idx]);
					if ((map.checkStreetAddressComponents(results[idx].address_components) >= 4) && (results[idx].types.indexOf("street_address") > -1)) {
						tmp = google.maps.geometry.spherical.computeDistanceBetween(latlng,results[idx].geometry.location);
						if (tmp < distance) {
							result_idx = idx;
							distance = tmp;
						}
						
					}
				});
				if (result_idx > -1) {
					map.current_address_info.setPosition(results[result_idx].geometry.location);
					str = "<div id='infoAddress'>"+results[result_idx].formatted_address+"</div>";
				}
				//console.dir(map.current_georesults.streets);
			}
			else {
				//actions.showStreetSearchingResults();
				str = "Геокодирование неудачно по следующей причине: " + status;	
			}
			map.current_address_info.setContent(str);
			map.current_address_info.open(map.map);
		});
	}
	
	this.createCustomMarker = function(latlng,icon_name,marker_drag) {
		marker_drag = marker_drag || false;
		switch (icon_name){
			case "MARKER_BORDER":
				var image = new google.maps.MarkerImage(
					"/maps/img/marker_border.png",
					new google.maps.Size(20,34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shadow = new google.maps.MarkerImage(
					"/maps/img/marker_border_shadow.png",
					new google.maps.Size(37, 34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shape = {
    				coord: [7,0,5,2,5,21,7,23,12,23,14,21,14,2,12,0],
				    type: 'poly'
				};
				break;
			case "MARKER_START":
				var image = new google.maps.MarkerImage(
					"/maps/img/marker_start.png",
					new google.maps.Size(20,34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shadow = new google.maps.MarkerImage(
					"/maps/img/start_stop_shadow.png",
					new google.maps.Size(37, 34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shape = {
    				coord: [7,0,5,2,5,21,7,23,12,23,14,21,14,2,12,0],
				    type: 'poly'
				};
				break;
			case "MARKER_STOP":
				var image = new google.maps.MarkerImage(
					"/maps/img/marker_stop.png",
					new google.maps.Size(20,34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shadow = new google.maps.MarkerImage(
					"/maps/img/start_stop_shadow.png",
					new google.maps.Size(37, 34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shape = {
    				coord: [7,0,5,2,5,21,7,23,12,23,14,21,14,2,12,0],
				    type: 'poly'
				};
				break;
			case "MARKER_WAY_POINT":
				var image = new google.maps.MarkerImage(
					"/maps/img/marker_way_point.png",
					new google.maps.Size(20,34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shadow = new google.maps.MarkerImage(
					"/maps/img/start_stop_shadow.png",
					new google.maps.Size(37, 34),
					new google.maps.Point(0,0),
				    new google.maps.Point(10,34)
				);
				var shape = {
    				coord: [7,0,5,2,5,21,7,23,12,23,14,21,14,2,12,0],
				    type: 'poly'
				};
				break;	
				
			default: return null;
		}
		return new google.maps.Marker({
			map: this.map,
			position: latlng,
			draggable: marker_drag,
			animation: google.maps.Animation.DROP,
			shadow: shadow,
    	    icon: image,
	        shape: shape
   		});
	}
	
	this.createNewPolygon = function(arr_coords,color,visible,onlyclick) {
		visible = (typeof visible == "undefined")?true:visible;
		onlyclick = (typeof onlyclick == "undefined")?false:onlyclick;
		if (!color) var color = "#FFFFFF";
		if (arr_coords.length > 2) {
			arr_coords.push(arr_coords[0]);
			var polygon = new google.maps.Polygon({
    			paths: arr_coords,
			    strokeColor: (color.substring(0,1) == "#")?color:"#"+color,
		    	strokeOpacity: 0.8,
			    strokeWeight: 2,
			    fillColor: (color.substring(0,1) == "#")?color:"#"+color,
			    fillOpacity: 0.30,
				clickable: true
			});
			/*polygon.infoWindow = new google.maps.InfoWindow({content: "<strong>Name</strong>"});
			google.maps.event.addListener(polygon, 'mouseover', function(e) {
				//this.setOptions({fillOpacity:0.1});
				polygon.infoWindow.setPosition(e.latLng);
				polygon.infoWindow.open(map.map);
			});
			google.maps.event.addListener(polygon, 'mouseout', function() {
				//this.setOptions({fillOpacity:0.35});
				polygon.infoWindow.close();
			});*/
			if (onlyclick === true) 
				google.maps.event.addListener(polygon,"click",function(ev){
					map.clickMap(ev);
					ev.stop();
				});
			else
				google.maps.event.addListener(polygon,"dblclick",function(ev){
					var parking = map.getParkingByLatLng(ev.latLng);
					if (parking !== null) {
						map.clearAddressInfo();
						map.current_address_info = new google.maps.InfoWindow({
      						content: "<div id='infoAddress'>Стоянка "+parking.name+"</div>"
	  					});
						map.current_address_info.setPosition(ev.latLng);
						map.current_address_info.open(map.map);
						google.maps.event.addListener(map.current_address_info, 'closeclick', function() { map.clearAddressInfo(); });
					}
					ev.stop();
				});
			if (visible === true) polygon.setMap(this.map);
			return polygon;
		}
		else return null;
	}
	
	this.getParkingByLatLng = function(latlng){
		for (var i=0;i<parkings.length;i++){
			//if (google.maps.geometry.poly.containsLocation(latlng,parkings[i].polygon) == true) return parkings[i];
			/*for (k = 0;  k < parkings[i].coords.length - 1; j = i++)
				for (j = parkings[i].coords.length - 1;)
        {
            if ((((poly[i].Lt <= point.Lt) && (point.Lt < poly[j].Lt)) || ((poly[j].Lt <= point.Lt) && (point.Lt < poly[i].Lt))) &&
                (point.Lg < (poly[j].Lg - poly[i].Lg) * (point.Lt - poly[i].Lt) / (poly[j].Lt - poly[i].Lt) + poly[i].Lg))
                c = !c;
        }*/
			if (this.isPointInPoly(parkings[i].coords,latlng) == true) return parkings[i];
			
		}
		return null;
	}
	
	this.getAddressByLatLng = function(latlng,tip) {
		this.geocoder.geocode( { 'latLng': latlng }, function(results, status) {
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.street)) map.current_georesults.markers.street.setMap(null);
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.number)) map.current_georesults.markers.number.setMap(null);
			map.current_georesults = new Object();	
			map.current_georesults.streets = new Array();
			map.current_georesults.markers = new Object();
	    	if (status == google.maps.GeocoderStatus.OK) {
				//console.dir(results);
				$(results).each(function(idx){
					//console.dir(results[idx]);
					if ((map.checkStreetAddressComponents(results[idx].address_components) >= 3) && ((results[idx].types.indexOf("street_address") > -1) || (results[idx].types.indexOf("route") > -1))) map.current_georesults.streets.push(results[idx]);
				});
				//console.dir(map.current_georesults.streets);
				if (map.hand_made_street == true) actions.showStreetSearchingResults(true);
      		} 
			else {
				//actions.showStreetSearchingResults();
				alert("Геокодирование неудачно по следующей причине: " + status);	
			}
		});
	}
	
	this.getStreet = function(street,show) {
		show = show || false;
    	this.geocoder.geocode( { 'address': street, 'bounds': map.map.getBounds()}, function(results, status) {
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.street)) map.current_georesults.markers.street.setMap(null);
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.number)) map.current_georesults.markers.number.setMap(null);
			map.current_georesults = new Object();	
			map.current_georesults.streets = new Array();
			map.current_georesults.markers = new Object();
	    	if (status == google.maps.GeocoderStatus.OK) {
				//console.dir(results);
				$(results).each(function(idx){
					//console.dir(results[idx]);
					if ((map.checkStreetAddressComponents(results[idx].address_components) >= 3) && (results[idx].types.indexOf("route") > -1)) map.current_georesults.streets.push(results[idx]);
				});
				if (show) actions.showStreetSearchingResults(true);
      		} 
			else {
				if (show) {
					actions.showStreetSearchingResults();
					alert("Геокодирование неудачно по следующей причине: " + status);	
				}
			}
		});
	}
	
	this.markStreet = function(bound,latlng,title,tip,marker_drag) {
		marker_drag = marker_drag || false;
		tip = tip || 0;
		if (bound) this.map.fitBounds(bound);
		//this.map.panToBounds(bound);
		var image = new google.maps.MarkerImage(
			"",
			new google.maps.Size(32,37),
			new google.maps.Point(0,0),
			new google.maps.Point(16,37)
		);
		var shadow = new google.maps.MarkerImage(
			"/maps/img/marker_shadow.png",
			new google.maps.Size(48, 37),
			new google.maps.Point(0,0),
			new google.maps.Point(16,37)
		);
		var shape = {
			coord: [15,4,9,8,4,8,3,9,3,33,4,34,27,34,28,33,28,9,27,8,22,8,16,4],
		    type: 'poly'
		};
		if (!map.current_georesults.markers) map.current_georesults.markers = new Object();
		//console.log(tip);
		switch (tip) {
			case 0:
				image.url = "/maps/img/marker_street.png";
				if (this.current_georesults.markers && this.current_georesults.markers.street) this.current_georesults.markers.street.setMap(null);
				this.current_georesults.markers.street = new google.maps.Marker({
   					map: this.map,
   					position: latlng,
					draggable: marker_drag,
					animation: google.maps.Animation.DROP,
					title: title,
					shadow: shadow,
    			    icon: image,
			        shape: shape
   				});
				if (title.length > 0) {
					google.maps.event.addListener(this.current_georesults.markers.street, 'click', function() {
						var marker = map.current_georesults.markers.street
						var infowindow = new google.maps.InfoWindow({ 
							content: "<div class='markerInfo'>"+marker.getTitle()+"</div>"
						});
						infowindow.open(map.map,marker);
	  				});
				}
				if (marker_drag == true) 
					google.maps.event.addListener(this.current_georesults.markers.street, 'dragend', function() {
						map.map.setCenter(this.getPosition());	
						map.current_georesults.streets[$("#strSearchList input:checked").val()].geometry.location = this.getPosition();
						map.current_georesults.streets[$("#strSearchList input:checked").val()].geometry.viewport = map.map.getBounds();
	  				});
				break;
			case 1:
				image.url = "/maps/img/marker_house.png";
				if (this.current_georesults.markers && this.current_georesults.markers.street) this.current_georesults.markers.street.setMap(null);
				if (this.current_georesults.markers && this.current_georesults.markers.number) this.current_georesults.markers.number.setMap(null);
				this.current_georesults.markers.number = new google.maps.Marker({
   					map: this.map,
   					position: latlng,
					draggable: marker_drag,
					animation: google.maps.Animation.DROP,
					title: title,
					shadow: shadow,
    			    icon: image,
			        shape: shape
   				});	
				if (marker_drag == true) 
					google.maps.event.addListener(this.current_georesults.markers.number, 'dragend', function() {
						map.map.setCenter(this.getPosition());	
						map.current_georesults.address[0].geometry.location = this.getPosition();
						map.current_georesults.address[0].geometry.viewport = map.map.getBounds();
	  				});
				break;
			case 2:
				image.url = "/maps/img/marker_street.png";
				if (this.current_georesults.markers && this.current_georesults.markers.street) this.current_georesults.markers.street.setMap(null);
				this.current_georesults.markers.street = new google.maps.Marker({
   					map: this.map,
   					position: latlng,
					draggable: marker_drag,
					animation: google.maps.Animation.DROP,
					title: title,
					shadow: shadow,
    			    icon: image,
			        shape: shape
   				});
				if (marker_drag == true) 
					google.maps.event.addListener(this.current_georesults.markers.street, 'dragend', function() {
						map.map.setCenter(this.getPosition());	
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lat = this.getPosition().lat();
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lng = this.getPosition().lng();
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lat1 = map.map.getBounds().getNorthEast().lat();
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lng1 = map.map.getBounds().getNorthEast().lng();
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lat2 = map.map.getBounds().getSouthWest().lat();
						selectStreet.streets[selectStreet.getSelectedStreetIdx()].lng2 = map.map.getBounds().getSouthWest().lng();
						$("#btnSaveStreet").removeClass("hidden");
	  				});
				break;
		}
		
		
		
	}
	
	this.getAddressComponentByType = function(address_components,s_component) {
		var tmp = false;
		$(address_components).each(function(idx){ 
			//console.log(s_component);
			//console.dir(address_components[idx].types);
			if (address_components[idx].types.indexOf(s_component) > -1) {
				tmp = address_components[idx];
				return false;
			}
		});	
		return tmp;
	}
	
	this.parsingStreetAddressComponents = function(address_components) {
		return new Array(
			this.getAddressComponentByType(address_components,"route") || "",
			this.getAddressComponentByType(address_components,"locality") || "",
			this.getAddressComponentByType(address_components,"country") || "",
			this.getAddressComponentByType(address_components,"sublocality") || "",
			this.getAddressComponentByType(address_components,"street_number") || ""
		);
	}
	
	this.checkStreetAddressComponents = function(address_components) {
		var tmp = 0;
		if (this.getAddressComponentByType(address_components,"route")) tmp++;
		if (this.getAddressComponentByType(address_components,"locality")) tmp++;
		if (this.getAddressComponentByType(address_components,"country")) tmp++;
		if (this.getAddressComponentByType(address_components,"sublocality")) tmp++;
		return tmp;
	}
	
	this.getAddress = function(str_name,number,show,partial_match) {
		partial_match = partial_match || false;
		this.geocoder.geocode( { 'address': str_name+" "+number, 'bounds': map.map.getBounds()}, function(results, status) {
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.street)) map.current_georesults.markers.street.setMap(null);
			else 
			if ((map.current_georesults) && (map.current_georesults.markers) && (map.current_georesults.markers.number)) map.current_georesults.markers.number.setMap(null);
			//console.dir(results);
			map.current_georesults = new Object();	
			map.current_georesults.address = new Array();
			map.current_georesults.markers = new Object();
	    	if (status == google.maps.GeocoderStatus.OK) {
				if ((results[0].types.indexOf("street_address") > -1) && (map.getAddressComponentByType(results[0].address_components,"street_number")).long_name.toUpperCase() == number.toUpperCase() && ((!results[0].partial_match) || partial_match)) {
					map.current_georesults.address.push(results[0]);
					//console.log(map.getStreetNumber(results[0].address_components));
				}
				if (show) actions.showAddressSearchingResults();
	      	} 
			else {
				alert("Геокодирование неудачно по следующей причине: " + status);
				$("#btnHandmadeAddress").html("Найти вручную")
										.removeClass("hidden");
			}
		});
	}
	
	this.getStreetNumber1 = function(address_components) {
		var number = null;
		$(address_components).each(function(idx){ 							
			if (address_components[idx].types.indexOf("street_number") > -1) {
				number = address_components[idx].long_name;
				return false;
			}
		});
		return number;
	}
	
	this.clearAddressInfo = function(show_off){
		show_off = false || show_off;
		if (show_off == true) this.show_address = false;
		if (this.current_address_info !== null) {
			this.current_address_info.close();
			this.current_address_info = null;
		}
	}
	
	this.searchNumber = function(points,idx,show_route,order_number){
		if ((points[idx].ready == false) && (points[idx].near == true)) {
			var street = selectStreet.getStreetById(points[idx].street_id);
			this.geocoder.geocode( { 'address': street.name+" "+points[idx].adr+" "+street.city, 'bounds': map.map.current_bounds}, function(results, status) {
				//console.dir(street);																											 
				//console.dir(results);
		    	if (status == google.maps.GeocoderStatus.OK) {
					for (var i=0;i<results.length;i++)
						if ((results[i].types.indexOf("street_address") > -1) && ((map.getAddressComponentByType(results[i].address_components,"street_number")).long_name.toUpperCase() == points[idx].adr.toUpperCase()) && (((map.getAddressComponentByType(results[i].address_components,"locality")).long_name == street.city) ||((map.getAddressComponentByType(results[i].address_components,"locality")).long_name == street.city_ukr))  && (!results[i].partial_match)) {
							points[idx].latlng = results[i].geometry.location;
							points[idx].viewport = results[i].geometry.viewport;
							points[idx].near = false;
							break;
						}
					if (points[idx].near == true) points[idx].latlng = new google.maps.LatLng(street.lat,street.lng);
		      	} 
				else {
					points[idx].near = true;
					points[idx].latlng =new google.maps.LatLng(street.lat,street.lng);
				}
				points[idx].ready = true;
				//console.dir(points[idx]);
				if (typeof actions !=="undefined") actions.calculateRoute(points);
				else arm.calculateRoute(points,show_route,order_number);
			});
		}
		else {
			points[idx].ready = true;
			if (typeof actions !=="undefined") actions.calculateRoute(points);
			else arm.calculateRoute(points,show_route,order_number);
		}
	}
	
	this.getAreaPay = function(latlng,type){
		for (var i=0;i<areas.length;i++) {
			if ((areas[i].type == type) && google.maps.geometry.poly.containsLocation(latlng,areas[i].polygon)) return parseFloat(areas[i].amount);
		}
		return 0;
	}
	
	this.getTransitAreaPay = function(legs){
		//console.dir(legs);
		return 0;
		for (var i=0;i<areas.length;i++) {
			if ((areas[i].type == 2) && google.maps.geometry.poly.containsLocation(latlng,areas[i].polygon)) return parseFloat(areas[i].amount);
		}
		return 0;
	}
}

// объект запросов к БД

function AjaxQuery() {
	self = this;

	this.init = function(){
		this.getParkings();
		this.getTransit();
		this.getAreas();
		this.getCities();
		this.getStreets();
		this.getTarifs();
	}
	
	this.saveMap = function(){
		var data_txt = "action_name=saveMap&lat="+map.map.getCenter().lat()+"&lng="+map.map.getCenter().lng()+"&zoom="+map.map.getZoom();
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					alert("Сохранено");
				}
				else {
					alert(json.error);//checkError(json.error);
				}
				//showLoader(false);
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
				//showLoader(false);
			}
		});
	}
	
	this.saveStreet = function(name,region,city,country,lat,lng,lat1,lng1,lat2,lng2) {
		var data_txt = "action_name=saveStreet&name="+name+"&region="+region+"&city="+city+"&country="+country+"&lat="+lat+"&lng="+lng+"&lat1="+lat1+"&lng1="+lng1+"&lat2="+lat2+"&lng2="+lng2+((map.hand_made_street == true)?"&handmade=1":"")+((map.hand_edit_street == true)?"&id="+selectStreet.selectedId:"");
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					//console.log(actions.searched_street_id);
					if ((typeof actions !=="undefined") && (actions.searched_street_id > 0)) {
						ajax_query.markStreet(actions.searched_street_id);	
					}
					alert("Сохранено");
					ajax_query.getStreets();
				}
				else {
					alert(json.error);//checkError(json.error);
					//alert(json.sql);
				}
				//showLoader(false);
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
				//showLoader(false);
			}
		});		
	}
	
	this.deleteStreet = function(id) {
		var data_txt = "action_name=deleteStreet&&id="+id;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions !=="undefined") actions.clearStreetResults();
					ajax_query.getStreets();
					alert("Удалено");
				}
				else {
					alert(json.error);//checkError(json.error);
					//alert(json.sql);
				}
				//showLoader(false);
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
				//showLoader(false);
			}
		});		
	}
	
	this.saveAddress = function(id,number,lat,lng,lat1,lng1,lat2,lng2) {
		var data_txt = "action_name=saveAddress&id="+id+"&number="+number.toLowerCase()+"&lat="+lat+"&lng="+lng+"&lat1="+lat1+"&lng1="+lng1+"&lat2="+lat2+"&lng2="+lng2+((map.hand_made_number == true)?"&handmade=1":"");
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					alert("Сохранено");
					ajax_query.getNumbers(id,number);
				}
				else {
					alert(json.error);
					alert(json.sql);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});		
	}
	
	this.saveNumber = function(id,number,lat,lng,lat1,lng1,lat2,lng2) {
		var data_txt = "action_name=saveAddress&id="+id+"&number="+number.toLowerCase()+"&lat="+lat+"&lng="+lng+"&lat1="+lat1+"&lng1="+lng1+"&lat2="+lat2+"&lng2="+lng2;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions !=="undefined") ajax_query.getNumbers(id,number);
					else alert('mapMsg:saveAddress{"id":'+id+',"id_address":'+json.id_address+',"number":"'+number.toLowerCase()+'","lat":"'+lat+'","lng":"'+lng+'","lat1":"'+lat1+'","lng1":"'+lng1+'","lat2":"'+lat2+'","lng2":"'+lng2+'","num":'+json.num+',"korp":"'+json.korp+'"}');
				}
				/*else {
					alert(json.error);
					alert(json.sql);
				}*/
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				//alert(textStatus);
			}
		});		
	}
	
	this.getCities = function() {
		var data_txt = "action_name=getCities";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					cities = json.cities;
					if (typeof actions !=="undefined") {
						$("#adrCity").empty();
						$("#routeCity").empty();
						$(json.cities).each(function(idx){
							$("#adrCity").append("<option value='"+json.cities[idx]+"'>"+json.cities[idx]+"</option>");
							$("#adrCity option").filter(function() { return $(this).text() == map_city; }).prop('selected', true);
							$("#routeCity").append("<option value='"+json.cities[idx]+"'>"+json.cities[idx]+"</option>");
							$("#routeCity option").filter(function() { return $(this).text() == map_city; }).prop('selected', true);
						});
					}
				}
				else {
					alert(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});		
	}
	
	this.getStreets = function() {
		var data_txt = "action_name=getStreets&city="+map_city+"&city_ukr="+map_city_ukr;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.streets) {
						selectStreet.streets = json.streets;
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});		
	}
	
	this.getNumbers = function(id,number) {
		var data_txt = "action_name=getNumbers&id="+id;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.numbers) {
						if (actions) {
							actions.numbers = json.numbers;
							if (typeof number == "boolean") {
								if (number == true) {
									actions.fillSelect();
								}
								else actions.showNumbers();
							}
							else actions.showNumbers(number);
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});		
	}
	
	this.deleteNumber = function(id,id_address,number) {
		var data_txt = "action_name=deleteNumber&id="+id+"&id_address="+id_address+"&number="+number;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.numbers) {
						if (typeof actions !=="undefined") {
							actions.numbers = json.numbers;
							actions.showNumbers();
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});		
	}
	
	this.getTarifs = function(){
		var data_txt = "action_name=getTarifs";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.tarifs) {
						map_tarifs = json.tarifs;
						if (typeof actions !=="undefined") {
							actions.showTarifs();
						}
						else alert("mapMsg:saveTarifs"+JSON.stringify(json.tarifs));
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.saveTarifs = function(num,km,tarif_min,podacha,coef){
		var data_txt = "action_name=saveTarifs&num="+num+"&km="+km+"&min="+tarif_min+"&podacha="+podacha+"&coef="+coef;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.tarifs) {
						map_tarifs = json.tarifs;
						if (typeof actions !=="undefined") {
							actions.showTarifs();
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.getParkings = function(){
		var data_txt = "action_name=getParkings";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.parkings) {
						parkings = json.parkings;
						if (typeof actions !== "undefined") {
							actions.showParkings();
						}
						else arm.showParkings(false);
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.saveParking = function(name,id){
		if (id) {
			var idx = getParkingIdxById(id);
			parkings[idx].polygon.setEditable(false);
			var paths = parkings[idx].polygon.getPaths().getArray()[0].getArray();
			var str_coords = "";
			for(var i=0;i<paths.length-1;i++) str_coords += paths[i].lat()+","+paths[i].lng()+";"
		}
		else {
			if (actions && (map.completed_polygon == null)) {
				alert("Необходимо задать приблизительные границы стоянки...");	
				return false;
			}
			var paths = map.completed_polygon.getPaths().getArray()[0].getArray();
			var str_coords = "";
			for(var i=0;i<paths.length-1;i++) str_coords += paths[i].lat()+","+paths[i].lng()+";"
		}
		var data_txt = "action_name=saveParking&name="+name+((id)?"&id="+id+"&color="+parkings[idx].color_hex:"")+((str_coords.length > 0)?"&coords="+str_coords:"");
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.parkings) {
						for(var i=0;i<parkings.length;i++) 
							if (parkings[i].polygon && (parkings[i].polygon !== null)) parkings[i].polygon.setMap(null);
						parkings = json.parkings;
						if (typeof actions !=="undefined") {
							actions.showParkings();
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
				if (map.completed_polygon !== null) {
					map.completed_polygon.setMap(null);
					map.completed_polygon = null;
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.deleteParking = function(id){
		var idx = getParkingIdxById(id);
		if (confirm("Вы действительно хотите удалить стоянку "+parkings[idx].name+"?")) {
			var data_txt = "action_name=deleteParking&id="+id;
			$.ajax({
				type: "POST",
				url: "ajax/map_actions.php",
				data: data_txt,
				dataType: "json",
				success: function (json, status) {
					if (json.results == "ok") {
						if (json.parkings) {
							parkings[idx].polygon.setMap(null);
							parkings = json.parkings;
							if (typeof actions !=="undefined") {
								actions.showParkings();
							}
						}
					}
					else {
						alert(json.error);//checkError(json.error);
					}
				},
				error: function (XMLHttpRequest, textStatus, errorThrown) {
					alert(textStatus);
				}
			});
		}
	}
	
	this.saveDistance = function(points,legs,saveanyway){
		//console.dir(points);
		//console.dir(legs);
		//console.log(saveanyway);
		if (saveanyway !== true) saveanyway = false;
		var distance_arr = new Array();
		for (var i=0;i<points.length-1;i++)
			distance_arr.push({
				start_street_id: points[i].street_id,
				start_number: points[i].adr,
				end_street_id: points[i+1].street_id,
				end_number: points[i+1].adr,
				distance: legs[i].distance.value,
				duration: legs[i].duration.value
			});
		var data_txt = "action_name=saveDistance&distance_arr="+JSON.stringify(distance_arr)+((saveanyway == true)?"&saveanyway=1":"");
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions == "undefined") arm.saveDistance(distance_arr,saveanyway);
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.checkDistance = function(points,near,add_pay,order_number){
		//console.log(order_number);
		var distance_arr = new Array();
		for (var i=0;i<points.length-1;i++)
			distance_arr.push({
				start_street_id: points[i].street_id,
				start_number: points[i].adr,
				end_street_id: points[i+1].street_id,
				end_number: points[i+1].adr
			});
		var data_txt = "action_name=checkDistance&distance_arr="+JSON.stringify(distance_arr);
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions !=="undefined") actions.showRouteProperty(json.distance,json.duration,add_pay);
					else arm.showRouteProperty(json.distance,json.duration,order_number);
				}
				else {
					if (typeof actions !=="undefined") actions.showRoutePolyline(points,near);
					else arm.showRoutePolyline(points,near,order_number);
					//alert(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.nextStreet = function(){
		var data_txt = "action_name=nextStreet";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions !=="undefined") {
						actions.clearStreetResults();
						if (json.street.length > 0) {
							actions.searched_street_id = json.street[0].id;
							$("#strName").val(json.street[0].name);
							$("#btnSearchStreet").click();
						}
					}
				}
				else alert(json.error);
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.markStreet = function(id){
		var data_txt = "action_name=markStreet&id="+id;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (typeof actions !=="undefined") actions.clearStreetResults();
				}
				else alert(json.error);
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.getAreas = function(){
		var data_txt = "action_name=getAreas";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.areas) {
						areas = json.areas;
						if (typeof actions !== "undefined") {
							actions.showAreas($("#boxControlsTab5").hasClass("active"));
						}
						else arm.showAreas(false);
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.saveArea = function(name,amount,id){
		if (id) {
			var idx = getAreaIdxById(id);
			areas[idx].polygon.setEditable(false);
			var paths = areas[idx].polygon.getPaths().getArray()[0].getArray();
			var str_coords = "";
			for(var i=0;i<paths.length-1;i++) str_coords += paths[i].lat()+","+paths[i].lng()+";"
		}
		else {
			if (actions && (map.completed_polygon == null)) {
				alert("Необходимо задать приблизительные границы района...");	
				return false;
			}
			var paths = map.completed_polygon.getPaths().getArray()[0].getArray();
			var str_coords = "";
			for(var i=0;i<paths.length-1;i++) str_coords += paths[i].lat()+","+paths[i].lng()+";"
		}
		var data_txt = "action_name=saveArea&name="+name+((id)?"&id="+id+"&color="+areas[idx].color_hex:"")+((str_coords.length > 0)?"&coords="+str_coords:"")+((!id)?"&type="+$("#areaType").val():"")+"&amount="+amount;
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.areas) {
						for(var i=0;i<areas.length;i++) 
							if (areas[i].polygon && (areas[i].polygon !== null)) areas[i].polygon.setMap(null);
						areas = json.areas;
						if (typeof actions !=="undefined") {
							actions.showAreas();
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
				if (map.completed_polygon !== null) {
					map.completed_polygon.setMap(null);
					map.completed_polygon = null;
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.deleteArea = function(id){
		var idx = getAreaIdxById(id);
		if (confirm("Вы действительно хотите удалить район "+areas[idx].name+"?")) {
			var data_txt = "action_name=deleteArea&id="+id;
			$.ajax({
				type: "POST",
				url: "ajax/map_actions.php",
				data: data_txt,
				dataType: "json",
				success: function (json, status) {
					if (json.results == "ok") {
						if (json.areas) {
							areas[idx].polygon.setMap(null);
							areas = json.areas;
							if (typeof actions !=="undefined") {
								actions.showAreas();
							}
						}
					}
					else {
						alert(json.error);//checkError(json.error);
					}
				},
				error: function (XMLHttpRequest, textStatus, errorThrown) {
					alert(textStatus);
				}
			});
		}
	}
	
	this.getTransit = function(){
		var data_txt = "action_name=getTransit";
		$.ajax({
			type: "POST",
			url: "ajax/map_actions.php",
			data: data_txt,
			dataType: "json",
			success: function (json, status) {
				if (json.results == "ok") {
					if (json.transit_points) {
						transit_points = json.transit_points;
						if (typeof actions !== "undefined") {
							actions.showTransit();
						}
					}
				}
				else {
					alert(json.error);//checkError(json.error);
				}
			},
			error: function (XMLHttpRequest, textStatus, errorThrown) {
				alert(textStatus);
			}
		});
	}
	
	this.saveTransit = function(){
		if (map.current_transit) {
			var str_coords = "";
			for(var i=0;i<map.current_transit.points.length;i++) 
				str_coords += ((map.current_transit.points[i].name.length > 0)?map.current_transit.points[i].name:"Точка "+(i+1))+","+map.current_transit.points[i].lat+","+map.current_transit.points[i].lng+";"
			var data_txt = "action_name=saveTransit&start_id="+map.current_transit.start_id+"&end_id="+map.current_transit.end_id+"&coords="+str_coords;
			$.ajax({
				type: "POST",
				url: "ajax/map_actions.php",
				data: data_txt,
				dataType: "json",
				success: function (json, status) {
					if (json.results == "ok") {
						if (json.transit_points) {
							transit_points = json.transit_points;
							if (typeof actions !== "undefined") {
								actions.showTransit();
								$("#transitInsert").removeClass("hidden");
								$("#transitSave").addClass("hidden");
							}
							//else arm.showParkings(false);
						}
					}
					else {
						alert(json.error);//checkError(json.error);
					}
				},
				error: function (XMLHttpRequest, textStatus, errorThrown) {
					alert(textStatus);
				}
			});
		}
	}
	
}

/**
 * Pop-up меня для удаления вершин многоугльников
 * @constructor
 */

function DeleteMenu() {
	this.div_ = document.createElement('div');
	this.div_.className = 'delete-menu';
	this.div_.innerHTML = 'Удалить';
	var menu = this;
	google.maps.event.addDomListener(this.div_, 'click', function() {
		menu.removeVertex();
	});
	///console.dir(this);
}

DeleteMenu.prototype.onAdd = function() {
	var deleteMenu = this;
	var map = this.getMap();
	this.getPanes().floatPane.appendChild(this.div_);
// mousedown в любом месте карты удаляет меню
	this.divListener_ = google.maps.event.addDomListener(map.getDiv(), 'mousedown', function(e) {
		if (e.target != deleteMenu.div_) {
			deleteMenu.close();
		}
	}, true);
};

DeleteMenu.prototype.onRemove = function() {
	google.maps.event.removeListener(this.divListener_);
	this.div_.parentNode.removeChild(this.div_);
// очищаем
	this.set('position');
	this.set('path');
	this.set('vertex');
};

DeleteMenu.prototype.close = function() {
	this.setMap(null);
};

DeleteMenu.prototype.draw = function() {
	var position = this.get('position');
	var projection = this.getProjection();
	if (!position || !projection) {
		return;
		
	}
	
	var point = projection.fromLatLngToDivPixel(position);

	this.div_.style.top = point.y + 'px';
	this.div_.style.left = point.x + 'px';
};

/**
* Открываем меню на выбраной вершине
*/
DeleteMenu.prototype.open = function(map, path, vertex) {
	//console.log(path.length);
	//console.log(vertex);
	//if (path.length < 4) return false;
	this.set('position', path.getAt(vertex));
	this.set('path', path);
	this.set('vertex', vertex);
	this.setMap(map);
	this.draw();
};
/**
* Удаление вершины
*/
DeleteMenu.prototype.removeVertex = function() {
	var path = this.get('path');
	var vertex = this.get('vertex');
	if (!path || vertex == undefined) {
		this.close();
		return;
	}
	path.removeAt(vertex);
	this.close();
};
