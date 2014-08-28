fcViews.year = YearView;

function YearView(element, calendar) {
	var t = this;

	// exports
	t.render = render;

	// imports
	BasicYearView.call(t, element, calendar, 'year');
	var opt = t.opt;
	var renderYear = t.renderYear;
	var formatDate = calendar.formatDate;

	function render(date, delta) {
		var firstMonth = opt('firstMonth') || 0;
		var lastMonth = opt('lastMonth') || firstMonth+12;
		var nbMonths = lastMonth - firstMonth;
		var dateRange = cloneDate(date, true);
		dateRange.setFullYear(date.getFullYear(),lastMonth,0, 12);
		if (delta) {
			addYears(date, delta);
		}
		// for school years month to year navigation
		else if (firstMonth > 0 && date.getMonth() <= dateRange.getMonth()) {
			addYears(date, -1);
		}
		var start = cloneDate(date, true);
		start.setFullYear(start.getFullYear(),firstMonth,1, 12);
		var end = cloneDate(date);
		end.setFullYear(end.getFullYear(),lastMonth,0, 12);

		var monthsPerRow = opt('yearColumns') || 3; //ex: '2x6', '3x4', '4x3'

		t.title = formatDate(start, opt('titleFormat'));
		if (firstMonth + nbMonths > 12) {
			t.title += formatDate(end, ' - yyyy');
		}

		t.start = start;
		t.end = end;

		renderYear(monthsPerRow, true);
	}
}

function BasicYearView(element, calendar, viewName) {
	var t = this;

	// exports
	t.renderYear = renderYear;
	t.setHeight = setHeight;
	t.setWidth = setWidth;
	t.renderDayOverlay = renderDayOverlay;
	t.defaultSelectionEnd = defaultSelectionEnd;
	t.renderSelection = renderSelection;
	t.clearSelection = clearSelection;
	t.reportDayClick = reportDayClick; // for selection (kinda hacky)
	t.defaultEventEnd = defaultEventEnd;
	t.getHoverListener = function() { return hoverListener; };
	t.colContentLeft = colContentLeft;
	t.colContentRight = colContentRight;
	t.colLeft = colLeft;
	t.colRight = colRight;
	t.dayOfWeekCol = dayOfWeekCol;
	t.dateCell = dateCell;
	t.allDayRow = allDayRow;
	t.allDayBounds = allDayBounds;
	t.getIsCellAllDay = function() { return true; };
	t.getRowCnt = function() { return rowCnt; };
	t.getColCnt = function() { return colCnt; };
	t.getColWidth = function() { return colWidth; };
	t.getBodyRows = function() { return bodyRows; };
	t.getDaySegmentContainer = function() { return daySegmentContainer; };
	t.getRowMaxWidth = getRowMaxWidth;

	View.call(t, element, calendar, viewName);
	OverlayManager.call(t);
	SelectionManager.call(t);

	t.rangeToSegments = rangeToSegmentsYear;
	BasicEventRenderer.call(t);

	t.rowToGridOffset = rowToGridOffset;
	t.cellToCellOffset = cellToCellOffset;

	t.dragStart = dragStart;
	t.dragStop  = dragStop;

	// overrides
	var cellOffsetToDayOffset = t.cellOffsetToDayOffset;
	t.cellOffsetToDayOffset = cellOffsetToDayOffsetYear;
	var dayOffsetToCellOffset = t.dayOffsetToCellOffset;
	t.dayOffsetToCellOffset = dayOffsetToCellOffsetYear;
	var changeView = calendar.changeView;
	calendar.changeView = changeViewFromYear;

	// imports
	var opt = t.opt;
	var trigger = t.trigger;
	var clearEvents = t.clearEvents;
	var renderOverlay = t.renderOverlay;
	var clearOverlays = t.clearOverlays;
	var isHiddenDay = t.isHiddenDay;
	var daySelectionMousedown = t.daySelectionMousedown;
	var formatDate = calendar.formatDate;
	var cellToDate = t.cellToDate;

	// locals
	var table;
	var bodyRows;

	var subTables;

	var bodyCells;
	var bodyCellTopInners;
	var daySegmentContainer;
	var refreshCoordGrids;

	var viewWidth;
	var colWidth;

	var rowCnt, colCnt;
	var coordinateGrids = [];
	var coordinateGrid;
	var hoverListener;
	var colContentPositions;
	var otherMonthDays = [];
	var rowsForMonth = [];

	var rtl, dis, dit;
	var firstDay;
	var firstMonth;
	var lastMonth;
	var hiddenMonths;
	var nwe;
	var tm;
	var colFormat;
	var yearCellMinH;
	var showWeekNumbers;
	var weekNumberTitle;
	var weekNumberFormat;


	/* Rendering
	------------------------------------------------------------*/

	disableTextSelection(element.addClass('fc-grid'));

	function renderYear(yearColumns, showNumbers) {
		updateOptions();
		setCalendarBounds();

		var firstTime = !table;
		if (!firstTime) {
			clearEvents();
			table.remove();
		}

		var monthsPerRow = parseInt(yearColumns,10); //"3x4" parses to 3
		buildSkeleton(monthsPerRow, showNumbers);
		updateCells();
		opt('debug') && debugCellOffsets();
		buildCoordGrids();

		// trigger user defined dayRender callback
		if (typeof(t.opt('dayRender')) == 'undefined')
			return;
		bodyCells.each(function(i, _cell) {
			var match = this.className.match(/fc\-day\-(\d+)\-(\d+)\-(\d+)/);
			if (match != null) {
				var date = new Date(match[1], match[2]-1, match[3]);
				trigger('dayRender', t, date, $(_cell));
			}
		});
	}

	function updateOptions() {
		firstDay = opt('firstDay') || 0;
		firstMonth = opt('firstMonth') || 0;
		lastMonth = opt('lastMonth') || firstMonth+12;
		hiddenMonths = opt('hiddenMonths') || [];
		yearCellMinH = opt('yearCellMinH') || 20;
		colFormat = opt('columnFormat') || 'MMMM';
		showWeekNumbers = opt('weekNumbers');
		weekNumberTitle = opt('weekNumberTitle');
		weekNumberFormat = opt('weekNumberCalculation') != 'iso' ? "w" : "W";

		nwe = opt('weekends') ? 0 : 1;
		rtl = opt('isRTL');
		tm = opt('theme') ? 'ui' : 'fc';

		colCnt = nwe ? 5 : 7;
		if (rtl) {
			dis = -1;
			dit = colCnt - 1;
		} else {
			dis = 1;
			dit = 0;
		}
	}

	function setCalendarBounds() {

		var visStart = cloneDate(t.start);
		var visEnd = cloneDate(t.end);

		startOfWeek(visStart);

		addDays(visEnd, 14);
		startOfWeek(visEnd);
		t.skipHiddenDays(visEnd, -1, true);

		t.visStart = visStart;
		t.visEnd = visEnd;
	}

	function buildSkeleton(monthsPerRow, showNumbers) {
		var s;
		var headerClass = tm + "-widget-header";
		var contentClass = tm + "-widget-content";
		var head, headCells;
		var i, j, m, n, y, monthsRow = 0;
		var monthName, monthID, dayStr;
		var di = cloneDate(t.start);
		var miYear = di.getFullYear();
		var nbMonths = lastMonth-firstMonth;

		rowCnt = 0;
		var localWeekNames = [];
		// init days based on 2013-12 (1st is Sunday)
		for (m=0; m<7; m++) {
			di.setFullYear(2013,11,1+m, 12);
			localWeekNames[m] = formatDate(di, 'ddd');
		}
		di = cloneDate(t.start);
		s = '<table class="fc-year-main-table fc-border-separate" style="width:100%;"><tr>';
		s += '<td class="fc-year-month-border fc-first"></td>';
		n = 0;
		for (m=firstMonth; m<lastMonth; m++) {

			var hiddenMonth = ($.inArray(m,hiddenMonths) != -1);
			var display = (hiddenMonth ? 'display:none;' : '');

			di.setFullYear(miYear,m,1, 12);
			y = di.getFullYear();
			monthID = formatDate(di, 'yyyyMM');
			monthName = formatDate(di, 'MMMM');
			if (firstMonth + nbMonths > 12) {
				monthName = monthName + ' ' + y;
			}
			startOfWeek(di);

			// new month line
			if (n%monthsPerRow===0 && n > 0 && !hiddenMonth) {
				monthsRow++;
				s+='<td class="fc-year-month-border fc-last"></td>'+
					'</tr><tr>'+
					'<td class="fc-year-month-border fc-first"></td>';
			}

			if (n%monthsPerRow < monthsPerRow && n%monthsPerRow > 0 && !hiddenMonth) {
				s +='<td class="fc-year-month-separator"></td>';
			}

			s +='<td class="fc-year-monthly-td" style="' + display + '">';
			s +='<table class="fc-border-separate fc-year-month" style="width:100%;" cellspacing="0">'+
				'<thead>'+
				'<tr><td colspan="7" class="fc-year-monthly-header" />' +
					'<div class="fc-year-monthly-name'+(monthsRow===0 ?' fc-first':'')+'">' +
					'<a name="'+monthID+'" data-year="'+y+'" data-month="'+(m%12)+'" href="javascript:;">' +
					htmlEscape(monthName) + '</a>' +
					'</div>' +
				'</td></tr>' +
				'<tr>';


			if (showWeekNumbers) {
				s += "<th class='fc-week-number " + headerClass + "'>" +
					htmlEscape(weekNumberTitle) +
					"</th>";
			}

			for (i=firstDay; i<firstDay+7; i++) {
				if (nwe && (i%7 === 0 || i%7 === 6)) {
					continue;
				}
				// need fc- for setDayID
				s += '<th class="fc-year-weekly-head fc-'+dayIDs[i%7]+' '+headerClass+'" width="'+((100/colCnt)|0)+'%">'+
				 localWeekNames[i%7]+'</th>';
			}
			s += '</tr></thead><tbody>';

			rowsForMonth[m] = 0;
			for (i=0; i<6; i++) {
				if (nwe) { skipWeekend(di); }
				// don't show week if all days are in next month
				if (di.getMonth() == (m+1)%12 && opt('weekMode') != 'fixed') {
					continue;
				}
				rowsForMonth[m]++;
				rowCnt++;

				s += '<tr class="fc-week' + i + '">';
				if (showWeekNumbers) {
					s +=
						"<td class='fc-week-number " + contentClass + "'>" +
						"<div>" +
						htmlEscape(formatDate(di, weekNumberFormat)) +
						"</div>" +
						"</td>";
				}
				for (j=0; j<colCnt; j++) {
					if (di.getMonth() == (m%12)) {
						dayStr=formatDate(di, '-yyyy-MM-dd');
					} else {
						dayStr='';
					}
					s += '<td class="'+contentClass+' fc-day fc-'+dayIDs[di.getDay()]+' fc-day'+dayStr + '">' + // need fc- for setDayID
					'<div>' +
						(showNumbers ? '<div class="fc-day-number"/>' : '') +
						'<div class="fc-day-content" style="min-height:'+yearCellMinH+'px;">' +
							'<div style="position:relative;"></div>' +
						'</div>' +
					'</div>' +
					'</td>';
					addDays(di, 1);
					if (nwe) { skipWeekend(di); }
				}
				s += '</tr>';
			}
			s += '</tbody></table>';
			s += '<div class="fc-year-monthly-footer"></div>';
			s += '</td>';

			if (!hiddenMonth) { n++; }
		}
		s += '<td class="fc-year-month-border fc-last"></td>';
		s += '</tr></table>';

		table = $(s).appendTo(element);
		head = table.find('thead');
		headCells = head.find('th.fc-year-weekly-head');

		bodyRows = table.find('table tbody tr');
		bodyCells = bodyRows.find('td').not('.fc-year-monthly-td');

		subTables = table.find('table');
		subTables.find('tbody .fc-week0').addClass('fc-first');
		subTables.find('tbody > tr:last').addClass('fc-last');

		bodyCellTopInners = subTables.find('tbody .fc-week0 .fc-day-content div');

		markFirstLast(head.add(head.find('tr'))); // marks first+last tr/th's
		markFirstLast(bodyRows);

		table.find('.fc-year-monthly-name a').click(function() {
			calendar.changeView('month');
			calendar.gotoDate($(this).attr('data-year'), $(this).attr('data-month'), 15);
		});

		dayBind(bodyCells);
		daySegmentContainer = $('<div style="position:absolute;z-index:8;top:0;left:0;"/>').appendTo(element);
	}

	/**
	 * Compute otherMonthDays, set fc-today and day numbers
	 */
	function updateCells() {
		var today = clearTime(new Date());

		var d = cloneDate(t.start);
		var miYear = d.getFullYear();

		subTables.each(function(i, _sub) {

			var lastDateShown = 0;
			var mi = i+firstMonth;

			d.setFullYear(miYear,mi,1, 12);
			startOfWeek(d);

			otherMonthDays[mi] = [0,0,-1,-1];
			otherMonthDays[mi+1] = [0,0,-1,-1];

			$(_sub).find('tbody > tr').each(function(iii, _tr) {

				$(_tr).find('td').not('.fc-week-number').each(function(ii, _cell) {

					var cell = $(_cell);

					if (!dateInMonth(d,mi)) {
						cell.addClass('fc-other-month');
						if (d.getMonth() == (mi+11)%12) {
							// prev month
							otherMonthDays[mi][0]++;
						} else {
							// next month
							otherMonthDays[mi][1]++;
						}
					} else {
						if (otherMonthDays[mi][2] < 0) {
							// first in current month, hidden days at start
							otherMonthDays[mi][2] = d.getDate()-1;
						}
						lastDateShown = d.getDate();
					}
					if (+d == +today) {
						cell.addClass(tm + '-state-highlight fc-today');
					} else {
						cell.addClass((+d < +today) ? 'fc-past' : 'fc-future');
					}
					var dayNumber = d.getDate();
					cell.find('div.fc-day-number').text(dayNumber);

					addDays(d, 1);
					if (nwe) { skipWeekend(d); }
				});
			});

			var endDaysHidden = daysInMonth(t.start.getFullYear(), mi+1) - lastDateShown;
			// in current month, but hidden (weekends) at end
			otherMonthDays[mi][3] = endDaysHidden;

		});
		bodyRows.filter('.fc-year-have-event').removeClass('fc-year-have-event');
	}

	/**
	 * Show computed offsets to debug
	 */
	function debugCellOffsets() {
		var today = clearTime(new Date());

		var d = cloneDate(t.start);
		var miYear = d.getFullYear();

		subTables.each(function(i, _sub) {

			var lastDateShown = 0;
			var mi = i+firstMonth;

			d.setFullYear(miYear,mi,1, 12);
			startOfWeek(d);

			$(_sub).find('tbody > tr').each(function(iii, _tr) {

				$(_tr).find('td').not('.fc-week-number').each(function(ii, _cell) {

					var cell = $(_cell);

					var dayNumber = d.getDate();
					var dayOffset = t.dateToDayOffset(d);
					var cellOffset = dayOffsetToCellOffsetYear(dayOffset);
					dayNumber = dayNumber+"\n"+cellOffset+"-"+dayOffset+"/"+cellOffsetToDayOffsetYear(cellOffset);
					cell.find('div.fc-day-number').text(dayNumber);

					addDays(d, 1);
					if (nwe) { skipWeekend(d); }
				});
			});
		});
		bodyRows.filter('.fc-year-have-event').removeClass('fc-year-have-event');
	}

	function setHeight(height) {
		//not sure what supposed to do
	}

	function setWidth(width) {
		viewWidth = width;
		colContentPositions.clear();
	}


	/* Day clicking and binding
	-----------------------------------------------------------*/

	function dayBind(days) {
		days.click(dayClick).mousedown(daySelectionMousedown);
	}

	function dayClick(ev) {
		if (!opt('selectable')) { // if selectable, SelectionManager will worry about dayClick
			var match = this.className.match(/fc\-day\-(\d+)\-(\d+)\-(\d+)/);
			if (match != null) {
				var date = new Date(match[1], match[2]-1, match[3]);
				trigger('dayClick', this, date, true, ev);
			}
		}
	}


	/* Semi-transparent Overlay Helpers
	------------------------------------------------------*/

	function renderDayOverlay(overlayStart, overlayEnd) { // overlayEnd is exclusive

		if (!isFinite(overlayStart))
			return;

		var segments = t.rangeToSegments(overlayStart, overlayEnd);
		for (var i=0; i<segments.length; i++) {
			var segment = segments[i];
			var grid = coordinateGrids[segment.gridOffset];
			var gridRow = rowToGridRow(segment.row);
			dayBind(
				renderCellOverlay(
					grid,
					gridRow,
					segment.leftCol,
					gridRow,
					segment.rightCol
				)
			);
		}
		return;
	}

	function renderCellOverlay(grid, row0, col0, row1, col1) { // row1,col1 is inclusive
		var rect = grid.rect(row0, col0, row1, col1, element);
		return renderOverlay(rect, element);
	}

	/* used ? */
	function getRowMaxWidth(row) {
		return $(subTables[(row/5)|0]).width();
	}

	/* Selection
	-----------------------------------------------------------------------*/

	function defaultSelectionEnd(startDate, allDay) {
		return cloneDate(startDate);
	}

	function renderSelection(startDate, endDate, allDay) {
		renderDayOverlay(startDate, addDays(cloneDate(endDate), 1));
	}

	function clearSelection() {
		clearOverlays();
	}

	function reportDayClick(date, allDay, ev) {
		var cell = dateCell(date);
		var _element = bodyCells[cell.row*colCnt + cell.col];
		trigger('dayClick', _element, date, allDay, ev);
	}


	/* External Dragging
	-----------------------------------------------------------------------*/
	function dragStart(_dragElement, ev, ui) {
		hoverListener.start(function(cell) {
			clearOverlays();
			if (cell) {
				renderCellOverlay(cell.grid, cell.row, cell.col, cell.row, cell.col);
			}
		}, ev);
	}

	function dragStop(_dragElement, ev, ui) {
		var cell = hoverListener.stop();
		clearOverlays();
		if (cell) {
			var offset = t.cellToCellOffset(cell);
			var dayOffset = t.cellOffsetToDayOffset(offset);
			var d = t.dayOffsetToDate(dayOffset);
			trigger('drop', _dragElement, d, true, ev, ui);
		}
	}

	/* Utilities
	--------------------------------------------------------*/
	function cellsForMonth(i) {
		return rowsForMonth[i] * (nwe ? 5 : 7);
	}

	/* decrease date until start of week */
	function startOfWeek(d) {
		while (d.getDay() != firstDay) {
			addDays(d,-1);
		}
		if (nwe) { skipWeekend(d); }
	}

	function skipWeekend(date, inc, excl) {
		inc = inc || 1;
		while (!date.getDay() || (excl && date.getDay()==1 || !excl && date.getDay()==6)) {
			addDays(date, inc);
		}
		return date;
	}

	/* main function for event's position */
	function dayOffsetToCellOffsetYear(dOffset) {
		var i, j, offset = 0;
		var dayOffset = dOffset - otherMonthDays[firstMonth][0];
		if (dOffset < otherMonthDays[firstMonth][0]) {
			return dayOffsetToCellOffset(dOffset);
		}

		for (i=firstMonth; i<lastMonth; i++) {

			var moDays = daysInMonth(t.start.getFullYear(), i+1);
			var di = new Date(t.start.getFullYear(),i,1, 12,0);

			if (dayOffset < moDays || i == lastMonth-1) {

				offset += otherMonthDays[i][0]; //days in other month at beginning of month;

				for (j = 0; j < dayOffset; j++) {
					if (!nwe || !isHiddenDay(di)) {
						offset += 1;
					}
					addDays(di, 1);
				}
				return offset;
			}
			dayOffset -= moDays;
			offset += cellsForMonth(i);
		}
	}

	function cellToCellOffset(row, col, gridOffset) {

		// rtl variables. wish we could pre-populate these. but where?
		var dis = rtl ? -1 : 1;
		var dit = rtl ? colCnt - 1 : 0;

		if (typeof(row) == 'object') {
			gridOffset = row.grid.offset;
			col = row.col;
			row = row.row;
		}

		var offset = 0;
		for (var i = 0; i < (gridOffset || 0); i++) {
			offset += cellsForMonth(i+firstMonth);
		}

		offset += row * colCnt + (col * dis + dit); // column, adjusted for RTL (dis & dit)

		return offset;
	}

	/* handle selectable days clicks */
	function cellOffsetToDayOffsetYear(c) {
		var cellOffset = c;
		var offset = otherMonthDays[firstMonth][0];
		if (c < offset) {
			return cellOffsetToDayOffset(c);
		}

		var monthFirst=0;

		for (var i=firstMonth; i<lastMonth; i++) {
			var moDays = daysInMonth(t.start.getFullYear(), i+1);
			var moCellDays = cellsForMonth(i);

			if (cellOffset < moCellDays) {

				cellOffset -= otherMonthDays[i][0];
				cellOffset += otherMonthDays[i][2];
				var di = new Date(t.start.getFullYear(),i,1, 12);

				while (cellOffset > 0 || (nwe && isHiddenDay(di))) {
					if (!nwe || !isHiddenDay(di)) {
						cellOffset -= 1;
					}
					addDays(di, 1);
					offset += 1;
				}
				return offset;
			}

			monthFirst += moDays;
			cellOffset -= moCellDays;
			offset += moDays;
		}
	}

	// required to fix events on last month day
	function rangeToSegmentsYear(startDate, endDate) {
		//var rowCnt = t.getRowCnt();
		//var colCnt = t.getColCnt();
		var segments = []; // array of segments to return

		var realEnd = cloneDate(endDate);
		addDays(realEnd,-1);

		// ignore events outside current view
		if (realEnd < t.visStart || startDate > t.visEnd) {
			return segments;
		}

		// day offset for given date range
		var rangeDayOffsetStart = t.dateToDayOffset(startDate);
		var rangeDayOffsetEnd = t.dateToDayOffset(endDate); // exclusive

		// if ends in weekend, dont create a new segment
		if (nwe && isHiddenDay(realEnd)) {
			skipWeekend(realEnd,-1);
			addDays(realEnd,1);
			rangeDayOffsetEnd = t.dateToDayOffset(realEnd);
		}

		// first and last cell offset for the given date range
		// "last" implies inclusivity
		var rangeCellOffsetFirst = t.dayOffsetToCellOffset(rangeDayOffsetStart);
		var rangeCellOffsetLast = t.dayOffsetToCellOffset(rangeDayOffsetEnd - 1);

		var isStart, isEnd = false;

		// loop through all the rows in the view
		for (var row=0; row<rowCnt; row++) {

			// first and last cell offset for the row
			var rowCellOffsetFirst = row * colCnt;
			var rowCellOffsetLast = rowCellOffsetFirst + colCnt - 1;

			// get the segment's cell offsets by constraining the range's cell offsets to the bounds of the row
			var segmentCellOffsetFirst = Math.max(rangeCellOffsetFirst, rowCellOffsetFirst);
			var segmentCellOffsetLast = Math.min(rangeCellOffsetLast, rowCellOffsetLast);

			// make sure segment's offsets are valid and in view
			if (segmentCellOffsetFirst <= segmentCellOffsetLast) {

				var gridOffset = t.rowToGridOffset(row);
				var gridRow = rowToGridRow(row);
				var lenBefore = segmentCellOffsetFirst - rangeCellOffsetFirst;
				var skipSegment = false;

				// segment in next month could begin before start date
				if (!gridRow && segments.length && lenBefore >= 0 && lenBefore <= 14
				    && otherMonthDays[gridOffset+firstMonth][0] > 1) {
					segmentCellOffsetFirst = Math.min(rangeCellOffsetFirst, rowCellOffsetFirst);
				}

				// translate to cells
				var segmentCellFirst = t.cellOffsetToCell(segmentCellOffsetFirst);
				var segmentCellLast = t.cellOffsetToCell(segmentCellOffsetLast);

				// view might be RTL, so order by leftmost column
				var cols = [ segmentCellFirst.col, segmentCellLast.col ].sort();

				// Determine if segment's first/last cell is the beginning/end of the date range.
				// We need to compare "day offset" because "cell offsets" are often ambiguous and
				// can translate to multiple days, and an edge case reveals itself when we the
				// range's first cell is hidden (we don't want isStart to be true).
				var segmentDayOffsetLast = t.cellOffsetToDayOffset(segmentCellOffsetLast);

				// segment in end of month could ends after real end
				while (segmentDayOffsetLast >= rangeDayOffsetEnd) {
					cols[1]--; segmentDayOffsetLast--;
					if (cols[1] < cols[0]) {
						skipSegment = true;
						break;
					}
				}

				isStart = t.cellOffsetToDayOffset(segmentCellOffsetFirst) == rangeDayOffsetStart;
				isEnd = segmentDayOffsetLast + 1 == rangeDayOffsetEnd; // +1 (exclusively)

				// segment in hidden month
				if ($.inArray(firstMonth+gridOffset,hiddenMonths) != -1) {
					skipSegment = true;
				}

				// we could enhance this, hiding segments on hiddendays
				if (!skipSegment && gridOffset>=0) {
					segments.push({
						gridOffset: gridOffset,
						row: row,
						leftCol: cols[0],
						rightCol: cols[1],
						isStart: isStart,
						isEnd: isEnd
					});
				}
			}
		}
		return segments;
	}

	function daysInMonth(year, month) {
		return new Date(year, month, 0).getDate();
	}

	function dateInMonth(date, mi) {
		var y = date.getFullYear() - t.start.getFullYear();
		return (date.getMonth() == mi-(y*12));
	}

	// grid number of row
	function rowToGridOffset(row) {
		var cnt = 0, ret = -1;
		for (var i=firstMonth; i<lastMonth; i++) {
			cnt += rowsForMonth[i];
			if (row < cnt) {
				ret = i-firstMonth;
				break;
			}
		}
		return ret;
	}

	// row index in grid
	function rowToGridRow(row) {
		var cnt = 0, ret = -1;
		for (var i=firstMonth; i<lastMonth; i++) {
			cnt += rowsForMonth[i];
			if (row < cnt) {
				ret = row-(cnt-rowsForMonth[i]);
				break;
			}
		}
		return ret;
	}

	function defaultEventEnd(event) {
		return cloneDate(event.start);
	}

	function tableByOffset(offset) {
		return $(subTables[offset]);
	}

	function buildCoordGrids() {
		var nums = [];
		for (var i=firstMonth; i<lastMonth; i++) {
			nums.push(i);
		}
		coordinateGrids = [];
		$.each(nums, function(offset, m) {
			var grid = new CoordinateGrid(function(rows, cols) {
				var _subTable = tableByOffset(offset);
				var _head = _subTable.find('thead');
				var _headCells = _head.find('th.fc-year-weekly-head');
				var _bodyRows = _subTable.find('tbody tr');

				var e, n, p;
				_headCells.each(function(i, _e) {
					e = $(_e);
					n = e.offset().left;
					p = [n, n+e.outerWidth()];
					cols[i] = p;
				});
				_bodyRows.each(function(i, _e) {
					if (i < rowCnt) {
						e = $(_e);
						n = e.offset().top;
						p = [n, n+e.outerHeight()];
						rows[i] = p;
					}
				});
			});
			grid.offset = offset;
			coordinateGrids.push(grid);
		});
		t.refreshCoordGrids = false;

		hoverListener = new HoverListener(coordinateGrids);
	}

	colContentPositions = new HorizontalPositionCache(function(col) {
		return bodyCellTopInners.eq(col);
	});

	function colContentLeft(col, gridOffset) {
		var grid = tableByOffset(gridOffset);
		return colContentPositions.left(col) + grid.position().left;
	}

	function colContentRight(col, gridOffset) {
		var grid = tableByOffset(gridOffset);
		return colContentPositions.right(col) + grid.position().left;
	}

	function colLeft(col, gridOffset) {
		return colContentLeft(col, gridOffset);
	}

	function colRight(col, gridOffset) {
		return colContentRight(col, gridOffset);
	}

	function dateCell(date) {
		return {
			row: Math.floor(dayDiff(date, t.visStart) / 7),
			col: dayOfWeekCol(date.getDay())
		};
	}

	function dayOfWeekCol(dayOfWeek) {
		return ((dayOfWeek - Math.max(firstDay, nwe) + colCnt) % colCnt) * dis + dit;
	}

	function allDayRow(i) {
		return bodyRows.eq(i);
	}

	function allDayBounds(i) {
		return {
			left: 0,
			right: viewWidth
		};
	}

	// overrides Agenda function to set current date from school view (multi-year)
	// else a click to 'month/week' buttons could use the previous year
	function changeViewFromYear(newViewName) {
		var currentView = calendar.getView().name;
		changeView(newViewName);
		if (firstMonth > 0 && currentView == 'year' && newViewName != currentView) {
			var today = clearTime(new Date());
			calendar.gotoDate(today);
		}
	}

}
