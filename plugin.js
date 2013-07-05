﻿/**
 * @license Copyright (c) 2003-2013, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or http://ckeditor.com/license
 */

/**
 * @fileOverview Increase and decrease indent commands.
 */

(function() {
	'use strict';

	CKEDITOR.plugins.add( 'indent', {
		lang: 'af,ar,bg,bn,bs,ca,cs,cy,da,de,el,en,en-au,en-ca,en-gb,eo,es,et,eu,fa,fi,fo,fr,fr-ca,gl,gu,he,hi,hr,hu,is,it,ja,ka,km,ko,ku,lt,lv,mk,mn,ms,nb,nl,no,pl,pt,pt-br,ro,ru,si,sk,sl,sq,sr,sr-latn,sv,th,tr,ug,uk,vi,zh,zh-cn', // %REMOVE_LINE_CORE%
		icons: 'indent,indent-rtl,outdent,outdent-rtl', // %REMOVE_LINE_CORE%

		init: function( editor ) {
			// Register generic commands.
			setupGenericListeners( editor,
				editor.addCommand( 'indent',
					new CKEDITOR.plugins.indent.genericDefinition( true ) ) );
			setupGenericListeners( editor,
				editor.addCommand( 'outdent',
					new CKEDITOR.plugins.indent.genericDefinition() ) );

			// Create and register toolbar button if possible.
			if ( editor.ui.addButton ) {
				editor.ui.addButton( 'Indent', {
					label: editor.lang.indent.indent,
					command: 'indent',
					directional: true,
					toolbar: 'indent,20'
				} );

				editor.ui.addButton( 'Outdent', {
					label: editor.lang.indent.outdent,
					command: 'outdent',
					directional: true,
					toolbar: 'indent,10'
				} );
			}

			// Register dirChanged listener.
			editor.on( 'dirChanged', function( evt ) {
				var range = editor.createRange(),
					dataNode = evt.data.node;

				range.setStartBefore( dataNode );
				range.setEndAfter( dataNode );

				var walker = new CKEDITOR.dom.walker( range ),
					node;

				while ( ( node = walker.next() ) ) {
					if ( node.type == CKEDITOR.NODE_ELEMENT ) {
						// A child with the defined dir is to be ignored.
						if ( !node.equals( dataNode ) && node.getDirection() ) {
							range.setStartAfter( node );
							walker = new CKEDITOR.dom.walker( range );
							continue;
						}

						// Switch alignment classes.
						var classes = editor.config.indentClasses;
						if ( classes ) {
							var suffix = ( evt.data.dir == 'ltr' ) ? [ '_rtl', '' ] : [ '', '_rtl' ];
							for ( var i = 0; i < classes.length; i++ ) {
								if ( node.hasClass( classes[ i ] + suffix[ 0 ] ) ) {
									node.removeClass( classes[ i ] + suffix[ 0 ] );
									node.addClass( classes[ i ] + suffix[ 1 ] );
								}
							}
						}

						// Switch the margins.
						var marginLeft = node.getStyle( 'margin-right' ),
							marginRight = node.getStyle( 'margin-left' );

						marginLeft ? node.setStyle( 'margin-left', marginLeft ) : node.removeStyle( 'margin-left' );
						marginRight ? node.setStyle( 'margin-right', marginRight ) : node.removeStyle( 'margin-right' );
					}
				}
			} );
		}
	} );

	/**
	 * Global command class definitions and global helpers.
	 *
	 * @class
	 * @singleton
	 */
	CKEDITOR.plugins.indent = {
		/**
		 * A base class for generic command definition, mainly responsible for creating indent
		 * UI buttons, and refreshing UI states.
		 *
		 * Commands of this class do not perform any indentation itself. They
		 * delegate job to content-specific indentation commands (i.e. indentlist).
		 *
		 * @class CKEDITOR.plugins.indent.genericDefinition
		 * @extends CKEDITOR.commandDefinition
		 * @param {CKEDITOR.editor} editor The editor instance this command will be
		 * related to.
		 * @param {String} name Name of the command.
		 * @param {Boolean} [isIndent] Define command as indenting or outdenting.
		 */
		genericDefinition: function( isIndent ) {
			/**
			 * Determines whether the command belongs to indentation family.
			 * Otherwise it's assumed as an outdenting one.
			 *
			 * @readonly
			 * @property {Boolean} [=false]
			 */
			this.isIndent = !!isIndent;

			// Mimic naive startDisabled behavior for outdent.
			this.startDisabled = !this.isIndent;
		},

		/**
		 * A base class for specific indentation command definitions responsible for
		 * handling a limited set of elements i.e. indentlist or indentblock.
		 *
		 * Commands of this class perform real indentation and modify DOM structure.
		 * They observe events fired by {@link CKEDITOR.plugins.indent.genericDefinition}
		 * and execute defined actions.
		 *
		 * **NOTE**: This is not an {@link CKEDITOR.command editor command}.
		 * Context-specific commands are internal, for indentation system only.
		 *
		 * @class CKEDITOR.plugins.indent.specificDefinition
		 * @param {CKEDITOR.editor} editor The editor instance this command will be
		 * related to.
		 * @param {String} name Name of the command.
		 * @param {Boolean} [isIndent] Define command as indenting or outdenting.
		 */
		specificDefinition: function( editor, name, isIndent ) {
			this.name = name;
			this.editor = editor;

			/**
			 * An object of jobs handled by the command. Each job consist
			 * of two functions: `refresh`, `exec` and priority.
			 *
			 * * The `refresh` function determines whether a job is doable for
			 * a particular context. These functions are executed in the
			 * order of priorities, one by one, for all plugins that registered
			 * jobs. As jobs are related to generic commands, refreshing
			 * occurs when the global command is firing the `refresh` event.
			 * This function must return either {@link CKEDITOR#TRISTATE_DISABLED}
			 * or {@link CKEDITOR#TRISTATE_OFF}.
			 *
			 * * The `exec` function modifies DOM if it's possible. Just like
			 * `refresh`, `exec` functions are executed in the order of priorities
			 * while the global command is executed.
			 * This function must return boolean, indicating whether it was successful.
			 *
			 * For details, please check comments for `setupGenericListeners` function.
			 *
			 *		command.jobs = {
			 *			// Priority = 20.
			 *			20: {
			 *				refresh( editor, path ) {
			 *					if ( condition )
			 *						return CKEDITOR.TRISTATE_OFF;
			 *					else
			 *						return CKEDITOR.TRISTATE_DISABLED;
			 *				},
			 *				exec( editor ) {
			 *					// Modify DOM
			 *				}
			 *			},
			 *			// Priority = 60. This job is done later.
			 *			60: {
			 *				// Another job.
			 *			}
			 *		};
			 *
			 * @readonly
			 * @property {Object} [={}]
			 */
			this.jobs = {};

			/**
			 * Determines whether the editor that command belongs to has
			 * config.enterMode set to CKEDITOR.ENTER_BR.
			 *
			 * @readonly
			 * @see CKEDITOR.config#enterMode
			 * @property {Boolean} [=false]
			 */
			this.enterBr = editor.config.enterMode == CKEDITOR.ENTER_BR;

			/**
			 * Determines whether the command belongs to indentation family.
			 * Otherwise it's assumed as an outdenting one.
			 *
			 * @readonly
			 * @property {Boolean} [=false]
			 */
			this.isIndent = !!isIndent;

			/**
			 * The global command's name related to this one.
			 *
			 * @readonly
			 */
			this.relatedGlobal = isIndent ? 'indent' : 'outdent';

			/**
			 * A keystroke associated with this command (TAB or SHIFT+TAB).
			 *
			 * @readonly
			 */
			this.indentKey = isIndent ? 9 : CKEDITOR.SHIFT + 9;

			/**
			 * Stores created markers for the command so they can eventually be
			 * purged after exec.
			 */
			this.database = {};
		},

		/**
		 * Registers content-specific commands as a part of indentation system
		 * directed by generic commands. Once a command is registered,
		 * it observes for events of a related generic command.
		 *
		 *		CKEDITOR.plugins.indent.registerCommands( editor, {
		 *			'indentlist': new indentListCommand( editor, 'indentlist' ),
		 *			'outdentlist': new indentListCommand( editor, 'outdentlist' )
		 *		} );
		 *
		 * Content-specific commands listen on generic command's `exec` and
		 * try to execute own jobs, one after another. If some execution is
		 * successful, `evt.data.done` is set so no more jobs (commands) are involved.
		 *
		 * Content-specific commands also listen on generic command's `refresh`
		 * and fill `evt.data.states` object with states of jobs. A generic command
		 * uses these data to determine own state and update UI.
		 *
		 * @member CKEDITOR.plugins.indent
		 * @param {CKEDITOR.editor} editor The editor instance this command is
		 * related to.
		 * @param {Object} commands An object of {@link CKEDITOR.command}.
		 */
		registerCommands: function( editor, commands ) {
			editor.on( 'pluginsLoaded', function() {
				for ( var name in commands ) {
					( function( editor, command ) {
						var relatedGlobal = editor.getCommand( command.relatedGlobal );

						for ( var priority in command.jobs ) {
							// Observe generic exec event and execute command when necessary.
							// If the command was successfully handled by the command and
							// DOM has been modified, stop event propagation so no other plugin
							// will bother. Job is done.
							relatedGlobal.on( 'exec', function( evt ) {
								if ( evt.data.done )
									return;

								// Make sure that anything this command will do is invisible
								// for undoManager. What undoManager only can see and
								// remember is the execution of the global command (relatedGlobal).
								editor.fire( 'lockSnapshot' );

								if ( command.execJob( editor, priority ) )
									evt.data.done = true;

								editor.fire( 'unlockSnapshot' );

								// Clean up the markers.
								CKEDITOR.dom.element.clearAllMarkers( command.database );
							}, this, null, priority );

							// Observe generic refresh event and force command refresh.
							// Once refreshed, save command state in event data
							// so generic command plugin can update its own state and UI.
							relatedGlobal.on( 'refresh', function( evt ) {
								if ( !evt.data.states )
									evt.data.states = {};

								evt.data.states[ command.name + '@' + priority ] =
									command.refreshJob( editor, priority, evt.data.path );
							}, this, null, priority );
						}

						// Since specific indent commands have no UI elements,
						// they need to be manually registered as a editor feature.
						editor.addFeature( command );
					} )( this, commands[ name ] );
				}
			} );
		}
	};

	CKEDITOR.plugins.indent.genericDefinition.prototype = {
		context: 'p',

		exec: function() {}
	};

	CKEDITOR.plugins.indent.specificDefinition.prototype = {
		/**
		 * Executes the content-specific procedure if the context is correct.
		 * It calls `exec` function of a job of the given `priority`
		 * that modifies DOM.
		 *
		 * @param {CKEDITOR.editor} editor The editor instance this command
		 * will be related to.
		 * @param {Number} priority The priority of the job to be executed.
		 * @returns {Boolean} Indicates whether job was successful.
		 */
		execJob: function( editor, priority ) {
			var job = this.jobs[ priority ];

			if ( job.state != CKEDITOR.TRISTATE_DISABLED )
				return job.exec.call( this, editor );
		},

		/**
		 * It calls `refresh` function of a job of the given `priority`.
		 * The function returns the state of the job which can be either
		 * {@link CKEDITOR#TRISTATE_DISABLED} or {@link CKEDITOR#TRISTATE_OFF}.
		 *
		 * @param {CKEDITOR.editor} editor The editor instance this command
		 * will be related to.
		 * @param {Number} priority The priority of the job to be executed.
		 * @returns {Number} The state of the job.
		 */
		refreshJob: function( editor, priority, path ) {
			var job = this.jobs[ priority ];

			job.state = job.refresh.call( this, editor, path );

			return job.state;
		},

		/**
		 * Method that checks if the element path contains an element handled
		 * by this indentation command.
		 *
		 * @param {CKEDITOR.dom.elementPath} node A path to be checked.
		 * @returns {CKEDITOR.dom.element}
		 */
		getContext: function( path ) {
			return path.contains( this.context );
		}
	};

	/**
	 * Attaches event listeners for this generic command. Since indentation
	 * system is event-oriented, generic commands communicate with
	 * content-specific commands using `exec` and `refresh` events.
	 *
	 * Listener priorities are crucial. Different indentation phases
	 * are executed whit different priorities.
	 *
	 * For `exec` event:
	 *
	 *	* 0: Selection and bookmarks are saved by generic command.
	 *	* 1-99: Content-specific commands try to indent the code by executing
	 *    own jobs ({@link CKEDITOR.plugins.indent.specificDefinition#jobs}).
	 *	* 100: Bookmarks are re-selected by generic command.
	 *
	 * For `refresh` event:
	 *
	 *	* <100: Content-specific commands refresh their job states according
	 *	  to the given path. Jobs save their states in `evt.data.states` object
	 *	  passed along with the event.
	 *	* 100: Command state is determined according to what states
	 *	  have been returned by content-specific commands (`evt.data.states`).
	 *	  UI elements are updated at this stage.
	 *
	 * @param {CKEDITOR.command} command Command to be set up.
	 * @private
	 */
	function setupGenericListeners( editor, command ) {
		var selection, bookmarks;

		// Set the command state according to content-specific
		// command states.
		command.on( 'refresh', function( evt ) {
			// If no state comes with event data, disable command.
			var states = [ CKEDITOR.TRISTATE_DISABLED ];

			for ( var s in evt.data.states )
				states.push( evt.data.states[ s ] );

			// Maybe a little bit shorter?
			if ( CKEDITOR.tools.search( states, CKEDITOR.TRISTATE_ON ) )
				this.setState( CKEDITOR.TRISTATE_ON );
			else if ( CKEDITOR.tools.search( states, CKEDITOR.TRISTATE_OFF ) )
				this.setState( CKEDITOR.TRISTATE_OFF );
			else
				this.setState( CKEDITOR.TRISTATE_DISABLED );
		}, command, null, 100 );

		// Initialization. Save bookmarks and mark event as not handled
		// by any plugin (command) yet.
		command.on( 'exec', function( evt ) {
			selection = editor.getSelection();
			bookmarks = selection.createBookmarks( 1 );

			// Mark execution as not handled yet.
			if ( !evt.data )
				evt.data = {};

			evt.data.done = false;
		}, command, null, 0 );

		// Housekeeping. Make sure selectionChange will be called.
		// Also re-select previously saved bookmarks.
		command.on( 'exec', function( evt ) {
			editor.forceNextSelectionCheck();
			selection.selectBookmarks( bookmarks );
		}, command, null, 100 );
	}
})();

/**
 * Size of each indentation step.
 *
 *		config.indentOffset = 4;
 *
 * @cfg {Number} [indentOffset=40]
 * @member CKEDITOR.config
 */

/**
 * Unit for the indentation style.
 *
 *		config.indentUnit = 'em';
 *
 * @cfg {String} [indentUnit='px']
 * @member CKEDITOR.config
 */