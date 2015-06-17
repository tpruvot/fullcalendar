
/* A multi months view with day cells running in rows (one-per-week) and columns
 * implementation by tpruvot@github - 2013/2015
----------------------------------------------------------------------------------------------------------------------*/

setDefaults({
	yearColumns: 2,
	fixedWeekCount: 5 // 5 rows per month minimum (else true or false)
});

// It is a manager for DayGrid sub components, which does most of the heavy lifting.
// It is responsible for managing width/height.

fcViews.year = View.extend({

	dayNumbersVisible: true, // display day numbers on each day cell?
	weekNumbersVisible: false, // display week numbers along the side?

	// locals

	weekNumberWidth: null, // width of all the week-number cells running down the side

	table: null,
	body: null,
	bodyRows: null,
	subTables: null,
	bodyCells: null,
	daySegmentContainer: null,

	colCnt: null,
	rowCnt: null,

	dayGrids: [], // the main sub components that does most of the heavy lifting

	rtl: null,
	dis: null,
	dit: null,

	firstDay: null,
	firstMonth: null,
	lastMonth: null,
	yearColumns: 2,
	nbMonths: null,
	hiddenMonths: [],

	nwe: null,
	tm: null,
	colFormat: null,

	// to remove later
	dayGrid: null,
	coordMap: null,
	otherMonthDays: [],
	rowsForMonth: [],

	initialize: function() {
		// this.start not yet set here...
		this.updateOptions();
		this.dayGrid = new DayGrid(this);
		this.dayGrids[0] = this.dayGrid;
		this.coordMap = this.dayGrid.coordMap;
	},

	updateOptions: function() {
		this.rtl = this.opt('isRTL');
		if (this.rtl) {
			this.dis = -1;
			this.dit = this.colCnt - 1;
		} else {
			this.dis = 1;
			this.dit = 0;
		}
		this.firstDay = parseInt(this.opt('firstDay'), 10);
		this.firstMonth = parseInt(this.opt('firstMonth'), 10) || 0;
		this.lastMonth = this.opt('lastMonth') || this.firstMonth+12;
		this.hiddenMonths = this.opt('hiddenMonths') || [];
		this.yearColumns = parseInt(this.opt('yearColumns'), 10) || 2;  //ex: '2x6', '3x4', '4x3'
		this.colFormat = this.opt('columnFormat');
		this.weekNumbersVisible = this.opt('weekNumbers');
		this.nwe = this.opt('weekends') ? 0 : 1;
		this.tm = this.opt('theme') ? 'ui' : 'fc';
		this.nbMonths = this.lastMonth - this.firstMonth;
		this.lastMonth = this.lastMonth % 12;
		this.lang = this.opt('lang');
	},

	// Computes what the title at the top of the calendar should be for this view
	computeTitle: function() {
		if (this.opt('yearTitleFormat') !== null) {
			var title = this.intervalStart.locale(this.lang).format(this.opt('yearTitleFormat'));
			var endMonth = this.intervalStart.clone().add(this.nbMonths - 1, 'months');
			if (endMonth.year() != this.intervalStart.year()) {
				title += this.intervalEnd.format(' - YYYY');
			}
			return title;
		} else {
			return this.formatRange(
				{ start: this.intervalStart, end: this.intervalEnd },
				this.opt('titleFormat') || this.computeTitleFormat(),
				this.opt('titleRangeSeparator')
			);
		}
	},

	render: function(delta) {
		var startMonth = Math.floor(this.intervalStart.month() / this.nbMonths) * this.nbMonths;
		if (!startMonth && this.firstMonth > 0 && !this.opt('lastMonth')) {
			// school
			startMonth = (this.firstMonth + startMonth) % 12;
		}
		this.intervalStart = fc.moment([this.intervalStart.year(), startMonth, 1]);
		this.intervalEnd = this.intervalStart.clone().add(this.nbMonths, 'months').add(-15, 'minutes');

		this.start = this.intervalStart.clone();
		this.start = this.skipHiddenDays(this.start); // move past the first week if no visible days
		this.start.startOf('week');
		this.start = this.skipHiddenDays(this.start); // move past the first invisible days of the week

		this.end = this.intervalEnd.clone();
		this.end = this.skipHiddenDays(this.end, -1, true); // move in from the last week if no visible days
		this.end.add((7 - this.end.weekday()) % 7, 'days'); // move to end of week if not already
		this.end = this.skipHiddenDays(this.end, -1, true); // move in from the last invisible days of the week

		var monthsPerRow = parseInt(this.opt('yearColumns'), 10);
		var weekCols = this.opt('weekends') ? 7 : 5; // this.getCellsPerWeek()

		this.renderYear(monthsPerRow, weekCols, true);
	},

	renderYear: function(yearColumns, colCnt, showNumbers) {
		this.colCnt = colCnt;
		var firstTime = !this.table;
		if (!firstTime) {
			this.destroyEvents();
			this.table.remove();
		}
		this.buildSkeleton(this.yearColumns, showNumbers);
		this.buildDayGrids();
		this.updateCells();
	},

	// Sets the display range and computes all necessary dates
	setRange: function(range) {
		View.prototype.setRange.call(this, range); // call the super-method
		// update dayGrids ?
	},

	// Compute the value to feed into setRange. Overrides superclass.
	computeRange: function(date) {
		this.constructor.duration = { months: this.nbMonths || 12 };
		var range = View.prototype.computeRange.call(this, date); // get value from the super-method

		// year and month views should be aligned with weeks. this is already done for week
		if (/year|month/.test(range.intervalUnit)) {
			range.start.startOf('week');
			range.start = this.skipHiddenDays(range.start);

			// make end-of-week if not already
			if (range.end.weekday()) {
				range.end.add(1, 'week').startOf('week');
				range.end = this.skipHiddenDays(range.end, -1, true); // exclusively move backwards
			}
		}

		return range;
	},

	// Build the year layout
	buildSkeleton: function(monthsPerRow, showNumbers) {
		var i, n, y, h = 0, monthsRow = 0;
		var miYear = this.intervalStart.year();
		var s, headerClass = this.tm + "-widget-header";
		var weekNames = [];

		this.rowCnt = 0;
		// init days based on 2013-12 (1st is Sunday)
		for (n=0; n<7; n++) {
			weekNames[n] = fc.moment([2013,11,1+n]).locale(this.lang).format('ddd');
		}
		s = '<table class="fc-year-main-table fc-border-separate" style="width:100%;"><tr>';
		s += '<td class="fc-year-month-border fc-first"></td>';
		for (n=0; n<this.nbMonths; n++) {

			var m = (this.intervalStart.month() + n);
			var hiddenMonth = ($.inArray((m % 12), this.hiddenMonths) != -1);
			var display = (hiddenMonth ? 'display:none;' : '');
			var di = fc.moment([miYear+(m / 12),(m % 12),1]).locale(this.lang);
			var monthName = capitaliseFirstLetter(di.format('MMMM'));
			var monthID = di.format('YYYYMM');
			y = di.year();
			if (this.firstMonth + this.nbMonths > 12) {
				monthName = monthName + ' ' + y;
			}

			// new month line
			if ((n%monthsPerRow)===0 && n > 0 && !hiddenMonth) {
				monthsRow++;
				s+='<td class="fc-year-month-border fc-last"></td>'+
					'</tr><tr>'+
					'<td class="fc-year-month-border fc-first"></td>';
			}

			if ((n%monthsPerRow) < monthsPerRow && (n%monthsPerRow) > 0 && !hiddenMonth) {
				s +='<td class="fc-year-month-separator"></td>';
			}

			s +='<td class="fc-year-monthly-td" style="' + display + '">';

			s +='<div class="fc-year-monthly-name'+(monthsRow===0 ? ' fc-first' : '')+'">' +
					'<a name="'+monthID+'" data-year="'+y+'" data-month="'+m+'" href="#">' + htmlEscape(monthName) + '</a>' +
				'</div>';

			s +='<div class="fc-row '+headerClass+'">';

			s +='<table class="fc-year-month-header">' +
				'<thead><tr class="fc-year-week-days">';

			s += this.headIntroHtml();

			for (i = this.firstDay; i < (this.colCnt+this.firstDay); i++) {
				s += '<th class="fc-day-header fc-year-weekly-head fc-'+dayIDs[i%7]+' '+headerClass+'">'+ // width="'+(Math.round(100/this.colCnt)||10)+'%"
				weekNames[i%7] + '</th>';
			}

			s += '</tr><tr>' +
			'</tr></thead></table>'; // fc-year-month-header

			s += '</div>'; // fc-row

			s += '<div class="fc-day-grid-container"><div class="fc-day-grid">';
			s += '</div></div>'; // fc-day-grid fc-day-grid-container

			s += '<div class="fc-year-monthly-footer"></div>';

			s += '</td>'; // fc-year-monthly-td

			if (hiddenMonth) {
				h++;
			}
		}
		s += '<td class="fc-year-month-border fc-last"></td>';
		s += '</tr></table>';

		this.table = $(s).appendTo(this.el);

		this.bodyRows = this.table.find('.fc-day-grid .fc-week');
		this.bodyCells = this.bodyRows.find('td.fc-day');
		this.bodyFirstCells = this.bodyCells.filter(':first-child');

		this.subTables = this.table.find('td.fc-year-monthly-td');

		this.head = this.table.find('thead');
		this.head.find('tr.fc-year-week-days th.fc-year-weekly-head:first').addClass('fc-first');
		this.head.find('tr.fc-year-week-days th.fc-year-weekly-head:last').addClass('fc-last');

		this.table.find('.fc-year-monthly-name a').click(this.calendar, function(ev) {
			ev.data.changeView('month');
			ev.data.gotoDate([$(this).attr('data-year'), $(this).attr('data-month'), 1]);
		});

		this.dayBind(this.bodyCells);
		this.daySegmentContainer = $('<div style="position:absolute;z-index:8;top:0;left:0;"/>').appendTo(this.table);
	},

	// Create month grids
	buildDayGrids: function() {
		var view = this;
		var nums = [];
		for (var i=0; i<this.nbMonths; i++) {
			nums.push(i + this.intervalStart.month());
		}

		var baseDate = view.intervalStart.clone().add(7, 'days'); // to be sure we are in month
		view.dayGrids = [];
		$.each(nums, function(offset, m) {

			var dayGrid = new DayGrid(view);
			var subTable = view.tableByOffset(offset);
			var monthDate = baseDate.clone().add(offset, 'months');

			dayGrid.headRowEl = subTable.find('.fc-row:first');
			dayGrid.scrollerEl = subTable.find('.fc-day-grid-container');
			dayGrid.coordMap.containerEl = dayGrid.scrollerEl; // constrain clicks/etc to the dimensions of the scroller

			dayGrid.el = subTable.find('.fc-day-grid');

			dayGrid.offset = offset;

			// need to fill that ?
			dayGrid.rowData = [];
			dayGrid.colData = [];

			var range = view.computeMonthRange(monthDate);
			dayGrid.start = range.start;
			dayGrid.end = range.end;
			dayGrid.breakOnWeeks = true;
			dayGrid.updateCells();

			view.dayNumbersVisible = dayGrid.rowCnt > 1; // TODO: make grid responsible
			dayGrid.numbersVisible = view.dayNumbersVisible || view.weekNumbersVisible;

			DayGrid.prototype.render.call(dayGrid, view.hasRigidRows()); // call the Grid super-method

			view.dayGrids.push(dayGrid);
		});

		// link first month dayGrid
		view.dayGrid = view.dayGrids[0];
		view.coordMap = view.dayGrid.coordMap;
	},

	isFixedWeeks: function() {
		var weekMode = this.opt('weekMode'); // LEGACY: weekMode is deprecated
		if (weekMode) {
			return weekMode === 'fixed'; // if any other type of weekMode, assume NOT fixed
		}
		return this.opt('fixedWeekCount');
	},

	// Compute the value to feed into setRange. Overrides superclass.
	computeMonthRange: function(date) {
		this.constructor.duration = { months: 1 };
		var range = View.prototype.computeRange.call(this, date); // get value from the super-method

		// year and month views should be aligned with weeks. this is already done for week
		if (/year|month/.test(range.intervalUnit)) {
			range.start.startOf('week');
			range.start = this.skipHiddenDays(range.start);

			// make end-of-week if not already
			if (range.end.weekday()) {
				range.end.add(1, 'week').startOf('week');
				range.end = this.skipHiddenDays(range.end, -1, true); // exclusively move backwards
			}

			var rowCnt = Math.ceil(range.end.diff(range.start, 'weeks', true)); // could be partial weeks due to hiddenDays
			// ensure 6 weeks if isFixedWeeks opt is set
			if (this.isFixedWeeks() === 5) {
				// else minimum 5 rows
				if (rowCnt == 4) {
					range.end.add(1, 'weeks');
				}
			}
			else if (this.isFixedWeeks()) {
				if (rowCnt <= 6) {
					range.end.add(6 - rowCnt, 'weeks');
				}
			}
		}
		return range;
	},

	// Make subcomponents ready for cleanup
	destroy: function() {
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.destroy();
		});
		View.prototype.destroy.call(this); // call the super-method
	},

	// Set css extra classes like fc-other-month and fill otherMonthDays
	updateCells: function() {
		var t = this;
		this.subTables.find('.fc-week:first').addClass('fc-first');
		this.subTables.find('.fc-week:last').addClass('fc-last');
		this.subTables.find('.fc-bg').find('td.fc-day:last').addClass('fc-last');
		this.subTables.each(function(i, _sub) {
			if (!t.curYear) { t.curYear = t.intervalStart; }

			var d = t.curYear.clone();
			var mi = (i + t.intervalStart.month()) % 12;

			d = t.dayGrids[i].start;

			var lastDateShown = 0;

			$(_sub).find('.fc-bg').find('td.fc-day:first').addClass('fc-first');

			t.otherMonthDays[mi] = [0,0,0,0];
			$(_sub).find('.fc-content-skeleton tr').each(function(r, _tr) {
				if (r === 0 && t.dateInMonth(d,mi)) {
					// in current month, but hidden (weekends) at start
					t.otherMonthDays[mi][2] = d.date()-1;
				}
				$(_tr).find('td').not('.fc-week-number').each(function(ii, _cell) {
					var cell = $(_cell);

					d = t.dayGrids[i].cellDates[ii + r*t.colCnt];
					if (!t.dateInMonth(d,mi)) {
						cell.addClass('fc-other-month');
						if (d.month() == (mi+11)%12) {
							// prev month
							t.otherMonthDays[mi][0]++;
							cell.addClass('fc-prev-month');
						} else {
							// next month
							t.otherMonthDays[mi][1]++;
							cell.addClass('fc-next-month');
						}
					} else {
						lastDateShown = d;
					}
				});
			});

			var endDaysHidden = t.daysInMonth(t.curYear.year(), mi+1) - lastDateShown;
			// in current month, but hidden (weekends) at end
			t.otherMonthDays[mi][3] = endDaysHidden;
		});
		t.bodyRows.filter('.fc-year-have-event').removeClass('fc-year-have-event');
	},

/* todo ?
	// Builds the HTML skeleton for the view.
	// The day-grid component will render inside of a container defined by this HTML.
	renderHtml: function() {
		return '' +
			'<table class="renderHtml">' +
				'<thead>' +
					'<tr>' +
						'<td class="' + this.widgetHeaderClass + '">' +
							this.dayGrid.headHtml() + // render the day-of-week headers
						'</td>' +
					'</tr>' +
				'</thead>' +
				'<tbody>' +
					'<tr>' +
						'<td class="' + this.widgetContentClass + '">' +
							'<div class="fc-day-grid-container">' +
								'<div class="fc-day-grid"/>' +
							'</div>' +
						'</td>' +
					'</tr>' +
				'</tbody>' +
			'</table>';
	},
*/
	// Generates the HTML that will go before the day-of week header cells.
	// Queried by the DayGrid subcomponent when generating rows. Ordering depends on isRTL.
	headIntroHtml: function() {
		if (this.weekNumbersVisible) {
			return '' +
				'<th class="fc-week-number-head ' + this.widgetHeaderClass + '">' +
					'<span>' + // needed for matchCellWidths
						htmlEscape(this.opt('weekNumberTitle')) +
					'</span>' +
				'</th>';
		} else {
			return '';
		}
	},


	// Generates the HTML that will go before content-skeleton cells that display the day/week numbers.
	// Queried by the DayGrid subcomponent. Ordering depends on isRTL.
	numberIntroHtml: function(row, dayGrid) {
		if (this.weekNumbersVisible) {
			dayGrid = dayGrid || this.dayGrid;
			return '' +
				'<td class="fc-week-number" ' + this.weekNumberStyleAttr('') + '>' +
					'<span>' + // needed for matchCellWidths
						this.calendar.calculateWeekNumber(dayGrid.getCell(row, 0).start) +
					'</span>' +
				'</td>';
		} else {
			return '';
		}
	},

	// Generates the HTML that goes before the day bg cells for each day-row.
	// Queried by the DayGrid subcomponent. Ordering depends on isRTL.
	dayIntroHtml: function() {
		if (this.weekNumbersVisible) {
			return '<td class="fc-week-number ' + this.widgetContentClass + '" ' +
				this.weekNumberStyleAttr('') + '></td>';
		} else {
			return '';
		}
	},

	// Generates the HTML that goes before every other type of row generated by DayGrid. Ordering depends on isRTL.
	// Affects helper-skeleton and highlight-skeleton rows.
	introHtml: function() {
		if (this.weekNumbersVisible) {
			return '<td class="fc-week-number" ' + this.weekNumberStyleAttr('') + '></td>';
		} else {
			return '';
		}
	},

	// Generates an HTML attribute string for setting the width of the week number column, if it is known (not head one)
	weekNumberStyleAttr: function() {
		var htm = '';
		if (this.weekNumberWidth !== null) {
			htm = 'style="width:' + this.weekNumberWidth + 'px;"';
		}
		return htm;
	},

	// Generates the HTML for the <td>s of the "number" row in the DayGrid's content skeleton.
	// The number row will only exist if either day numbers or week numbers are turned on.
	numberCellHtml: function(cell) {
		if (!this.dayNumbersVisible) { // if there are week numbers but not day numbers
			return '<td/>'; //  will create an empty space above events :(
		}

		var date = cell.start;
		var classes = this.dayGrid.getDayClasses(date);
		classes.unshift('fc-day-number');

		return '' +
			'<td class="' + classes.join(' ') + '" data-date="' + date.format() + '">' +
				date.date() +
			'</td>';
	},

	// Determines whether each row should have a constant height
	hasRigidRows: function() {
		var eventLimit = this.opt('eventLimit');
		return eventLimit && typeof eventLimit !== 'number';
	},


	/* Utilities
	--------------------------------------------------------*/

	cellsForMonth: function(i) {
		return this.rowsForMonth[i] * (this.nwe ? 5 : 7);
	},

	addDays: function(d, inc) {
		d.add(inc, 'days');
	},

	skipWeekend: function(date, inc, excl) {
		inc = inc || 1;
		while (!date.day() || (excl && date.day()==1 || !excl && date.day()==6)) {
			this.addDays(date, inc);
		}
		return date;
	},

	daysInMonth: function(year, month) {
		return fc.moment([year, month, 0]).date();
	},

	dateInMonth: function(date, mi) {
		//var y = date.year() - this.intervalStart.year();
		//return (date.month() == mi-(y*12));
		return (date.month() == (mi%12));
	},

	// grid number of row
	rowToGridOffset: function(row) {
		var cnt = 0;
		for (var i=this.firstMonth; i<this.lastMonth; i++) {
			cnt += this.rowsForMonth[i];
			if (row < cnt) { return (i-this.firstMonth); }
		}
		return -1;
	},

	// row index in grid
	rowToGridRow: function(row) {
		var cnt = 0;
		for (var i=this.firstMonth; i<this.lastMonth; i++) {
			cnt += this.rowsForMonth[i];
			if (row < cnt) { return row-(cnt-this.rowsForMonth[i]); }
		}
		return -1;
	},

	tableByOffset: function(offset) {
		return $(this.subTables[offset]);
	},


	/* Dimensions
	------------------------------------------------------------------------------------------------------------------*/

	// Sets the height of the Day Grid components in this view
	setGridHeight: function(height, isAuto, grid) {

		if (typeof(grid) != 'undefined') {
			if (isAuto) {
				undistributeHeight(grid.rowEls); // let the rows be their natural height with no expanding
			}
			else {
				distributeHeight(grid.rowEls, height, true); // true = compensate for height-hogging rows
			}
			return;
		}

		$.each(this.dayGrids, function(offset, dayGrid) {
			if (isAuto) {
				undistributeHeight(dayGrid.rowEls); // let the rows be their natural height with no expanding
			}
			else {
				distributeHeight(dayGrid.rowEls, height, true); // true = compensate for height-hogging rows
			}
		});
	},

	// scroller height based on first month
	computeScrollerHeight: function(totalHeight, scrollerEl) {
		var both;
		var otherHeight; // cumulative height of everything that is not the scrollerEl in the view (header+borders)

		scrollerEl = scrollerEl || this.scrollerEl;

		var monthTd = scrollerEl.closest('.fc-year-monthly-td');
		both = monthTd.add(scrollerEl);

		// fuckin IE8/9/10/11 sometimes returns 0 for dimensions. this weird hack was the only thing that worked
		both.css({
			position: 'relative', // cause a reflow, which will force fresh dimension recalculation
			left: -1 // ensure reflow in case the el was already relative. negative is less likely to cause new scroll
		});
		otherHeight = monthTd.outerHeight() - scrollerEl.height(); // grab the dimensions
		both.css({ position: '', left: '' }); // undo hack

		return totalHeight - otherHeight;
	},

	// Adjusts the vertical dimensions of the view to the specified values
	setHeight: function(totalHeight, isAuto) {
		var view = this;
		var eventLimit = this.opt('eventLimit');
		var scrollerHeight;

		$.each(this.dayGrids, function(offset, dayGrid) {

			if (dayGrid.el.length > 0) {
				// reset all heights to be natural
				unsetScroller(dayGrid.scrollerEl);
				uncompensateScroll(dayGrid.headRowEl);

				//this.containerEl = dayGrid.scrollerEl;
				dayGrid.destroySegPopover(); // kill the "more" popover if displayed

				// is the event limit a constant level number?
				if (eventLimit && typeof eventLimit === 'number') {
					dayGrid.limitRows(eventLimit); // limit the levels first so the height can redistribute after
				}
				if (!scrollerHeight) {
					// compute only once based on first month
					scrollerHeight = view.computeScrollerHeight(totalHeight, dayGrid.scrollerEl);
				}
				view.setGridHeight(scrollerHeight, isAuto, dayGrid);

				// is the event limit dynamically calculated?
				if (eventLimit && typeof eventLimit !== 'number') {
					dayGrid.limitRows(eventLimit); // limit the levels after the grid's row heights have been set
				}

				if (!isAuto && setPotentialScroller(dayGrid.scrollerEl, scrollerHeight)) { // using scrollbars?

					compensateScroll(dayGrid.headRowEl, getScrollbarWidths(dayGrid.scrollerEl));

					// doing the scrollbar compensation might have created text overflow which created more height. redo
					scrollerHeight = view.computeScrollerHeight(totalHeight, dayGrid.scrollerEl);
					dayGrid.scrollerEl.height(scrollerHeight);

					view.restoreScroll();
				}
			}
		});
	},

	// Refreshes the horizontal dimensions of the view
	updateWidth: function() {
		if (this.weekNumbersVisible) {
			// Make sure all week number cells running down the side have the same width.
			// Record the width for cells created later.
			this.weekNumberWidth = matchCellWidths(
				this.el.find('.fc-week-number')
			);
			if (this.weekNumberWidth) {
				this.el.find('.fc-week-number-head').width(this.weekNumberWidth + 2);
			}
		}
	},

	// Refreshes the vertical dimensions of the calendar
	updateHeight: function() {
		var calendar = this.calendar; // we poll the calendar for height information
		if (this.yearColumns > 0) {
			var height = calendar.getSuggestedViewHeight() * (1.10 / (0.01 +this.yearColumns));
			this.setHeight(height, calendar.isHeightAuto());
		}
	},


	/* Events
	------------------------------------------------------------------------------------------------------------------*/

	// Day clicking and binding
	dayBind: function(days) {
		days.click(this.dayClick);
		//days.mousedown(this.daySelectionMousedown);
	},

	dayClick: function(ev) {
		if (!this.opt('selectable')) { // if selectable, SelectionManager will worry about dayClick
			var match = this.className.match(/fc\-day\-(\d+)\-(\d+)\-(\d+)/);
			var date = new Date(match[1], match[2]-1, match[3]);
			$.trigger('dayClick', this, fc.moment(date), true, ev);
		}
	},

	// Renders the given events onto the view and populates the segments array
	renderEvents: function(events) {
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.renderEvents(events);
		});
		this.updateHeight(); // must compensate for events that overflow the row
	},


	// Retrieves all segment objects that are rendered in the view
	getEventSegs: function() {
		var segs = [];
		$.each(this.dayGrids, function(offset, dayGrid) {
			var gsegs = dayGrid.getEventSegs();
			for (var i=0; i<gsegs.length; i++) {
				segs.push(gsegs[i]);
			}
		});
		return segs;
	},


	// Unrenders all event elements and clears internal segment data
	destroyEvents: function() {
		this.recordScroll(); // removing events will reduce height and mess with the scroll, so record beforehand
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.destroyEvents();
		});

		// we DON'T need to call updateHeight() because:
		// A) a renderEvents() call always happens after this, which will eventually call updateHeight()
		// B) in IE8, this causes a flash whenever events are rerendered
	},


	/* Dragging (for both events and external elements)
	------------------------------------------------------------------------------------------------------------------*/

	// A returned value of `true` signals that a mock "helper" event has been rendered.
	renderDrag: function(dropLocation, seg) {
		var res = false;
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.renderDrag(dropLocation, seg);
		});
		return res; // hide the dragging seg if true
	},

	destroyDrag: function() {
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.destroyDrag();
		});
	},


	/* Selection
	------------------------------------------------------------------------------------------------------------------*/

	// Renders a visual indication of a selection (need to be done on each grid in range)
	renderSelection: function(range, gridFrom) {
		$.each(this.dayGrids, function(offset, dayGrid) {
			if (dayGrid !== gridFrom &&
			    (dayGrid.start <= range.end || dayGrid.end >= range.start)) {
				dayGrid.renderSelection(range);
			}
		});
	},

	// Unrenders a visual indications of a selection
	destroySelection: function() {
		$.each(this.dayGrids, function(offset, dayGrid) {
			dayGrid.destroySelection();
		});
	}

});
